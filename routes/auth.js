console.log('🔥 AUTH ROUTES LOADED');

const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { query } = require('../database/connection');
const { v4: uuidv4 } = require('uuid');
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
          email: user.email,
          role: user.role,
          companyId: user.company_id,
          trialEndsAt: user.trial_ends_at,
          isPro: user.is_pro,
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({ token });
    } catch (error) {
      console.error('LOGIN ERROR:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

//
// ✅ REGISTER
//
router.post('/register', async (req, res) => {
  console.log("REGISTER HIT:", req.body);

  try {
    const { email, password, name, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const companyId = uuidv4();

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);

    const result = await query(
      `INSERT INTO users 
      (email, password, name, role, company_id, trial_ends_at, is_pro, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, false, true)
      RETURNING *`,
      [
        email,
        hashedPassword,
        name || null,
        role || 'user',
        companyId,
        trialEnds
      ]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id,
        trialEndsAt: user.trial_ends_at,
        isPro: user.is_pro,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({ token });

  } catch (error) {
    console.error('REGISTER ERROR FULL:', error.message);
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

//
// ✅ APPLY ACCESS CODE
//
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
        role: user.role,
        companyId: user.company_id,
        trialEndsAt: user.trial_ends_at,
        isPro: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (error) {
    console.error('APPLY CODE ERROR:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;