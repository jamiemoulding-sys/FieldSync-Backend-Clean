const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../database/connection');

const {
  authenticateToken,
  requireRole,
  requireCompany
} = require('../middleware/auth');

const router = express.Router();

//
// =======================
// 🔐 LOGIN
// =======================
router.post('/login', async (req, res) => {
  try {
    console.log("🔥 LOGIN HIT");

    const { email, password } = req.body;

    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    console.log("USER:", user);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password) {
      return res.status(500).json({ error: 'User has no password set' });
    }

    const validPassword = await require('bcryptjs').compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = require('jsonwebtoken').sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token });

  } catch (error) {
    console.error("💥 LOGIN CRASH:", error);

    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

//
// =======================
// 🧾 REGISTER (ADMIN ONLY)
// =======================
router.post('/register',
  authenticateToken,
  requireRole('admin'),
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

      const result = await query(
        `INSERT INTO users (email, password, name, role, company_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, company_id`,
        [email, hashedPassword, name, role, req.user.companyId]
      );

      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Created user ${email} with role ${role}`
        ]
      );

      res.status(201).json({
        user: result.rows[0],
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
// 👥 GET USERS
// =======================
router.get('/',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT id, name, email, role, temp_role, temp_role_expires
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
// 🔥 UPDATE ROLE (PERMANENT)
// =======================
router.put('/:id/role',
  authenticateToken,
  requireCompany,
  requireRole('manager', 'admin'),
  async (req, res) => {
    try {
      const { role } = req.body;

      if (!['employee', 'manager', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      // ❌ prevent self-edit
      if (req.user.id === req.params.id) {
        return res.status(400).json({
          error: 'You cannot change your own role'
        });
      }

      if (req.user.role === 'manager' && role === 'admin') {
        return res.status(403).json({
          error: 'Managers cannot assign admin role'
        });
      }

      await query(
        `UPDATE users
         SET role = $1
         WHERE id = $2 AND company_id = $3`,
        [role, req.params.id, req.user.companyId]
      );

      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Changed role of user ${req.params.id} to ${role}`
        ]
      );

      res.json({ message: 'Role updated successfully' });

    } catch (error) {
      console.error('Role update error:', error);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

//
// =======================
// 🔁 TEMP ROLE (HOLIDAY COVER)
// =======================
router.put('/:id/temp-role',
  authenticateToken,
  requireCompany,
  requireRole('manager', 'admin'),
  async (req, res) => {
    try {
      const { role, expiresAt } = req.body;

      // ✅ REMOVE TEMP ROLE
      if (!role) {
        await query(
          `UPDATE users
           SET temp_role = NULL,
               temp_role_expires = NULL
           WHERE id = $1 AND company_id = $2`,
          [req.params.id, req.user.companyId]
        );

        return res.json({ message: 'Temporary role removed' });
      }

      if (!['manager', 'admin'].includes(role)) {
        return res.status(400).json({
          error: 'Invalid temp role'
        });
      }

      if (!expiresAt) {
        return res.status(400).json({
          error: 'Expiry date required'
        });
      }

      if (req.user.role === 'manager' && role === 'admin') {
        return res.status(403).json({
          error: 'Managers cannot assign admin role'
        });
      }

      await query(
        `UPDATE users
         SET temp_role = $1,
             temp_role_expires = $2
         WHERE id = $3 AND company_id = $4`,
        [role, expiresAt, req.params.id, req.user.companyId]
      );

      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Temporary role ${role} assigned to user ${req.params.id}`
        ]
      );

      res.json({ message: 'Temporary role assigned' });

    } catch (error) {
      console.error('Temp role error:', error);
      res.status(500).json({ error: 'Failed to assign temp role' });
    }
  }
);

//
// =======================
// ❌ DELETE USER (ADMIN ONLY)
// =======================
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

      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Deleted user ${req.params.id}`
        ]
      );

      res.json({ message: 'User deleted' });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

module.exports = router;