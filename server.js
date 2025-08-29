const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authenticateToken = require("./middleware/authMiddleware");
require('dotenv').config();
import { utcToZonedTime, format } from 'date-fns-tz';

const app = express();
app.use(cors());
app.use(express.json());
const SECRET_KEY = process.env.JWT_SECRET;

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

console.log("HOST: ", process.env.DB_HOST);
console.log("USER: ", process.env.DB_USER);
console.log("PASS: ", process.env.DB_PASS);
console.log("PORT: ", process.env.DB_PORT);
console.log("DBNAME: ", process.env.DB_NAME);

db.connect((err) => {
  if (err) {
    console.error("DB connection failed:", err);
  } else {
    console.log("DB connected");
  }
});

function getDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;

  return todayStr;
}

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  const userRole = "user";

  try {
    const checkEmail = "SELECT * FROM users WHERE email = ?";
    db.query(checkEmail, [email], async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Database problem" });
      }

      if (results.length > 0) {
        return res.status(400).json({ message: "Email is already in used" });
      }

      const saltRound = 10;
      const passwordHash = await bcrypt.hash(password, saltRound);

      const insertSql =
        "INSERT INTO users (username, email, password, user_role, current_boots) VALUES (?, ?, ?, ?, ?)";
      const value = [username, email, passwordHash, userRole, 0];
      db.query(insertSql, value, (err, result) => {
        if (err) {
          console.error(err);
          return res.json({ message: "Error until registing" });
        }
        return res.status(201).json({ message: "Registered successfully" });
      });
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error! CONTACT palmlogicdev@gmail.com" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const checkEmail = "SELECT * FROM users WHERE email = ?";
    db.query(checkEmail, [email], async (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Database problem" });
      }

      if (results.length <= 0) {
        return res
          .status(400)
          .json({
            message: "Looks like you're new here! Please register first.",
          });
      }

      const user = results[0];
      console.log(user);

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(400).json({ message: "Invalid password" });
      }

      const token = jwt.sign(
        { id: user.user_id, email: user.email, role: user.user_role },
        SECRET_KEY,
        { expiresIn: "30d" }
      );
      return res.json({ message: "Login Successful", token });
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error please CONTACT palmlogicdev@gmail.com" });
  }
});

app.post("/timer", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { timer_amount } = req.body;

  if (!timer_amount || isNaN(timer_amount)) {
    return res.status(400).json({ message: "Invalid timer amount" });
  }

  const sql = "INSERT INTO timer_histories (user_id, timer_amount) VALUES(?, ?)";
  db.query(sql, [userId, timer_amount], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }

    const today = getDate();
    const cheakDate = "SELECT * FROM boots WHERE user_id = ? AND date = ?";
    db.query(cheakDate, [userId, today], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }

      if (result.length > 0) {
        return res.json({
            message: "Timer logged. Boot already recorded today 🔥",
            timer_id: results.insertId
        });
      }

      let steak = 1;
      const sqlAddBoot = "INSERT INTO boots (user_id, date, streak) VALUES(?, ?, ?)";
      db.query(sqlAddBoot, [userId, today, steak], (err2) => {
        if (err2) {
          console.error(err2);
          return res.status(500).json({ error: err2.message });
        }

        const sqlBoots = "SELECT current_boots, email FROM users WHERE user_id = ?";
        db.query(sqlBoots, [userId], (err3, result3) => {
          if (err3) {
            console.error(err3);
            return res.status(500).json({ error: err3.message });
          }

          let user = null;
          if (result3.length > 0) {
            user = result3[0];
          } else {
            return res.json({ error: "User not found" });
          }

          let current_boots = user.current_boots + 1;
          const sqlAddBoots = "UPDATE users SET current_boots = ? WHERE user_id = ?";
          db.query(sqlAddBoots, [current_boots, userId], (err4) => {
            if (err4) {
              console.error(err4);
              return res.status(500).json({ error: err4.message });
            }

            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);

            const secondUntilMidnight = Math.floor((midnight - now) / 1000);

            const bootsToken = jwt.sign(
              { id: userId, email: user.email },
              SECRET_KEY,
              { expiresIn: secondUntilMidnight }
            );

            return res.json({
              message: "🔥 Boot logged successfully",
              boot: current_boots,
              bootsToken,
            });
          });
        });
      });
    });
  });
});

app.get("/hasBoot", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0,10);

  const sql = "SELECT * FROM boots WHERE user_id = ? AND date = ?";
  db.query(sql, [userId, today], (err, result) => {
    if(err) return res.status(500).json({error: err.message});
    res.json({ hasBoot: result.length > 0 });
  });
});

app.post("/updateBoots", async (req, res) => {
  const timeZone = 'Asia/Bangkok'; // Bangkok timezone
  const now = new Date();
  const zonedNow = utcToZonedTime(now, timeZone);

  const yesterday = new Date(zonedNow);
  yesterday.setDate(yesterday.getDate() - 1);

  const formattedYesterday = format(yesterday, 'yyyy-MM-dd', { timeZone });
  console.log("Yesterday (Bangkok):", formattedYesterday);

  // ดึง user ทั้งหมด
  const getUsers = "SELECT user_id FROM users";
  db.query(getUsers, (err, users) => {
    if (err) return res.status(500).json({ error: err.message });

    users.forEach(user => {
      const userId = user.user_id;

      // ตรวจสอบว่าผู้ใช้ทำ boot เมื่อวานหรือไม่
      const checkYesterday = "SELECT * FROM boots WHERE user_id = ? AND date = ?";
      db.query(checkYesterday, [userId, formattedYesterday], (err, results) => {
        if (err) return console.error(err);

        if (results.length === 0) {
          // ถ้าไม่มี boot เมื่อวาน → reset streak และลบ boot ทั้งหมด
          const updateStreak = "UPDATE users SET current_boots = 0 WHERE user_id = ?";
          db.query(updateStreak, [userId], (err2) => {
            if (err2) return console.error(err2);

            const deleteBoots = "DELETE FROM boots WHERE user_id = ?";
            db.query(deleteBoots, [userId], (err3) => {
              if (err3) return console.error(err3);

              console.log(`User ${userId} streak reset & boots deleted`);
            });
          });
        }
      });
    });

    res.json({ message: "Update streak process done" });
  });
});

app.get("/testCron", (req, res) => {
  console.log("Cron route hit");
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  const yyyy = yesterdayDate.getFullYear();
  const mm = String(yesterdayDate.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterdayDate.getDate()).padStart(2, '0');

  const yesterday = `${yyyy}-${mm}-${dd}`; // stays local
  console.log("Yesterday Time (local):", yesterday);

  res.json({ message: yesterday });
});

app.get("/profile", authenticateToken, (req, res) => {
  const userId = req.user.id;

  const sql =
    "SELECT user_id, username, email, user_role FROM users WHERE user_id = ?";
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: "Database problem" });
    }

    if (results.length <= 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: results[0] });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`App running on port ${PORT}`);
});