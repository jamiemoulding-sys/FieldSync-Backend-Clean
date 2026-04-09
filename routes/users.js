const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');

// 🔥 IMPORT NEW MIDDLEWARE
const {
  authenticateToken,
  requireRole,
  requireCompany
} = require('../middleware/auth');

const router = express.Router();

//
// =======================
// 🔐 LOGIN (UPDATED FOR COMPANY + ROLE)
// =======================
//
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 🔥 TOKEN NOW HAS COMPANY + ROLE
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.company_id || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.company_id
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 🧾 REGISTER (ADMIN CREATES USER IN SAME COMPANY)
// =======================
//
router.post('/register',
  authenticateToken,
  requireRole('admin'), // 🔥 ONLY ADMINS CAN CREATE USERS
  requireCompany,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').trim().isLength({ min: 2 }),
    body('role').isIn(['admin', 'manager', 'employee'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name, role } = req.body;

      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // 🔥 USER CREATED IN SAME COMPANY
      const result = await query(
        `INSERT INTO users (email, password, name, role, company_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, company_id`,
        [email, hashedPassword, name, role, req.user.companyId]
      );

      const newUser = result.rows[0];

      res.status(201).json({
        user: newUser,
        message: 'User created successfully'
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        error: "REAL_ERROR",
        message: error.message
      });
    }
  }
);

//
// =======================
// 👥 GET ALL USERS (COMPANY ISOLATED)
// =======================
//
router.get('/',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT id, name, email, role
        FROM users
        WHERE company_id = $1
        ORDER BY name ASC
      `, [req.user.companyId]);

      res.json(result.rows);

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

//
// =======================
// ❌ DELETE USER (ADMIN ONLY)
// =======================
//
router.delete('/:id',
  authenticateToken,
  requireRole('admin'),
  requireCompany,
  async (req, res) => {
    try {
      await query(
        `DELETE FROM users
         WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.user.companyId]
      );

      res.json({ message: 'User deleted' });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

module.exports = router;