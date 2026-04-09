const jwt = require('jsonwebtoken');

// =======================
// 🔐 AUTH MIDDLEWARE
// =======================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(' ')[1];

  if (!token || token === "undefined") {
    return res.status(401).json({ error: "Invalid token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ FORCE STRUCTURE (EXPANDED)
    req.user = {
      id: decoded.id,
      email: decoded.email,
      companyId: decoded.companyId || null,
      role: decoded.role || 'employee' // 🔥 NEW
    };

    next();

  } catch (err) {
    console.error("💥 JWT ERROR:", err.message);

    return res.status(403).json({
      error: "Invalid token",
      message: err.message
    });
  }
};

// =======================
// 👑 ROLE CHECK MIDDLEWARE
// =======================
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to perform this action"
      });
    }

    next();
  };
};

// =======================
// 🏢 COMPANY ISOLATION
// =======================
const requireCompany = (req, res, next) => {
  if (!req.user?.companyId) {
    return res.status(403).json({
      error: "No company assigned"
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  requireRole,     // 🔥 use this in routes
  requireCompany   // 🔥 protects multi-tenant data
};