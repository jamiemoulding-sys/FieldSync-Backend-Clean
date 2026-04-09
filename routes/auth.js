console.log("🔥 AUTH ROUTES LOADED");

const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// =======================
// ✅ LOGIN (CLEAN + SAFE)
// =======================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // ✅ ALWAYS SET ROLE
    const role = user.role || 'admin';

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        companyId: user.company_id || null,
        role,
        isPro: user.is_pro || false
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role,
        companyId: user.company_id,
        isPro: user.is_pro || false
      }
    });

  } catch (error) {
    console.error('💥 LOGIN ERROR:', error);

    res.status(500).json({
      error: error.message
    });
  }
});

//
// =======================
// ✅ REGISTER
// =======================
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, companyName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔥 CREATE COMPANY
    const companyResult = await query(
      `INSERT INTO companies (name)
       VALUES ($1)
       RETURNING *`,
      [companyName || 'My Company']
    );

    const company = companyResult.rows[0];

    // 🔥 CREATE USER
    const userResult = await query(
      `INSERT INTO users (email, password, name, company_id, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, hashedPassword, name || null, company.id, 'admin']
    );

    const user = userResult.rows[0];

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        companyId: company.id,
        role: 'admin',
        isPro: false
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'admin',
        companyId: company.id,
        isPro: false
      },
      company
    });

  } catch (error) {
    console.error("💥 REGISTER ERROR:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

//
// =======================
// ✅ APPLY ACCESS CODE
// =======================
router.post('/apply-code', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (code !== 'FULLACCESS2026') {
      return res.status(400).json({ error: 'Invalid code' });
    }

    const result = await query(
      `UPDATE users
       SET is_pro = true
       WHERE id = $1
       RETURNING *`,
      [req.user.id]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        companyId: user.company_id,
        role: user.role || 'admin',
        isPro: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });

  } catch (error) {
    console.error("💥 APPLY CODE ERROR:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;