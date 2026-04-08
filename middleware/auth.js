const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  console.log("🔐 AUTH HEADER:", authHeader);

  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(' ')[1];

  if (!token || token === "undefined") {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (err) {
    console.error("💥 JWT ERROR:", err.message);

    return res.status(403).json({
      error: "Invalid token",
      message: err.message
    });
  }
};

module.exports = { authenticateToken };