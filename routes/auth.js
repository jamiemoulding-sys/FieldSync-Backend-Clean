console.log("🔥 AUTH ROUTES LOADED");

const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// ✅ LOGIN (FULL DEBUG)
//
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    try {
      console.log("🔥 LOGIN HIT");
      console.log("📩 LOGIN BODY:", req.body);

      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: "Missing email or password",
          bodyReceived: req.body
        });
      }

      const result = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      console.log("👤 DB RESULT:", result.rows);

      const user = result?.rows?.[0];

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      // 🔥 CRITICAL DEBUG
      console.log("🔐 JWT SECRET EXISTS:", !!process.env.JWT_SECRET);

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      console.log("✅ TOKEN CREATED:", token);

      return res.json({ 
        token,
        debug: {
          userId: user.id,
          email: user.email
        }
      });

    } catch (error) {
      console.error('💥 LOGIN ERROR:', error);

      return res.status(500).json({
        error: error.message,
        stack: error.stack
      });
    }
  }
);

//
// ✅ REGISTER
//
router.post('/register', async (req, res) => {
  console.log("🔥 REGISTER HIT");
  console.log("📩 REGISTER BODY:", req.body);

  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required",
        bodyReceived: req.body
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (email, password, name)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [email, hashedPassword, name || null]
    );

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error("💥 REGISTER ERROR:", error);

    if (error.code === '23505') {
      return res.status(400).json({
        error: "Email already exists"
      });
    }

    res.status(500).json({
      error: error.message,
      code: error.code,
      bodyReceived: req.body
    });
  }
});

//
// ✅ APPLY ACCESS CODE
//
router.post('/apply-code', authenticateToken, async (req, res) => {
  try {
    console.log("🔥 APPLY CODE HIT");
    console.log("👤 USER FROM TOKEN:", req.user);

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
        isPro: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });

  } catch (error) {
    console.error("💥 APPLY CODE ERROR:", error);

    return res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;