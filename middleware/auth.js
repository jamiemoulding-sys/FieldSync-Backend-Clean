const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');

//
// =======================
// 🔐 AUTH MIDDLEWARE
// =======================
const authenticateToken = async (req, res, next) => {
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

    // 🔥 ALWAYS FETCH USER FROM DB (FOR LIVE ROLE + TEMP ROLE)
    const result = await query(
      `SELECT id, email, role, company_id, temp_role, temp_role_expires
       FROM users
       WHERE id = $1`,
      [decoded.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    let finalRole = user.role;

    // =======================
    // 🔁 TEMP ROLE OVERRIDE
    // =======================
    if (user.temp_role && user.temp_role_expires) {
      const now = new Date();
      const expiry = new Date(user.temp_role_expires);

      if (expiry > now) {
        finalRole = user.temp_role;
      } else {
        // 🧹 AUTO CLEANUP EXPIRED TEMP ROLE
        await query(
          `UPDATE users
           SET temp_role = NULL,
               temp_role_expires = NULL
           WHERE id = $1`,
          [user.id]
        );
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      companyId: user.company_id,
      role: finalRole
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

//
// =======================
// 👑 ROLE CHECK (HIERARCHY)
// =======================
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const hierarchy = {
      employee: 1,
      manager: 2,
      admin: 3
    };

    const userLevel = hierarchy[req.user.role] || 0;

    const allowed = roles.some(role => {
      return userLevel >= hierarchy[role];
    });

    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Requires role: ${roles.join(', ')}`
      });
    }

    next();
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

  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireCompany
};