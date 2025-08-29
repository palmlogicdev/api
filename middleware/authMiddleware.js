const jwt = require("jsonwebtoken");
const SECRET_KEY = "Xb7y)I/L/8L<=37BE{Ot>F9`$LAG:2";

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json("Access denied, no token");
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Invalid or expired token" });
        }
        req.user = user;
        next();
    })
}

module.exports = authenticateToken;