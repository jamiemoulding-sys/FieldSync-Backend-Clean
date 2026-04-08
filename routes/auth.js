console.log("🔥 AUTH ROUTES LOADED");

const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// ✅ LOGIN
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

      const { email, password } = req.body;

      const result = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      const user = result?.rows?.[0];

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({ token });

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
// ✅ REGISTER (DB CONNECTION TEST — FINAL DEBUG)
//
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );

    res.json({
      user: result.rows[0]
    });

  } catch (error) {
    console.error("💥 REGISTER ERROR:", error);

    res.status(500).json({
      error: error.message
    });
  }
});

//
// ✅ APPLY ACCESS CODE
//
router.post('/apply-code', authenticateToken, async (req, res) => {
  try {
    console.log("🔥 APPLY CODE HIT");

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