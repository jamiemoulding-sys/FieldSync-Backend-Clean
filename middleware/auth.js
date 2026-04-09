const jwt = require('jsonwebtoken');

//
// =======================
// 🔐 AUTH MIDDLEWARE
// =======================
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: "No valid authorization header"
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === "undefined" || token === "null") {
      return res.status(401).json({
        error: "Invalid token"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 FORCE SAFE STRUCTURE
    req.user = {
      id: decoded.id,
      email: decoded.email,
      companyId: decoded.companyId || null,
      role: decoded.role || 'employee'
    };

    return next();

  } catch (err) {
    console.error("💥 JWT ERROR:", err.message);

    return res.status(403).json({
      error: "Invalid token",
      message: err.message
    });
  }
};

//
// =======================
// 👑 ROLE CHECK
// =======================
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Requires role: ${roles.join(', ')}`
      });
    }

    return next();
  };
};

//
// =======================
// 🏢 COMPANY CHECK
// =======================
const requireCompany = (req, res, next) => {
  if (!req.user || !req.user.companyId) {
    return res.status(403).json({
      error: "No company assigned"
    });
  }

  return next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireCompany
};