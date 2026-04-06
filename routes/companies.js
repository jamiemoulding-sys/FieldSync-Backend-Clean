const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');

// 🔥 CONFIRM THIS FILE IS RUNNING
console.log('🚀 NEW COMPANIES ROUTE ACTIVE');


// 🏢 CREATE COMPANY
router.post('/create-company', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Company name required' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log('USER FROM TOKEN:', decoded);

    // 1. CREATE COMPANY
    const companyResult = await query(
      `INSERT INTO companies (name)
       VALUES ($1)
       RETURNING *`,
      [name]
    );

    const company = companyResult.rows[0];

    // 2. UPDATE USER
    const userResult = await query(
      `UPDATE users
       SET company_id = $1
       WHERE id = $2
       RETURNING *`,
      [company.id, decoded.id]
    );

    const user = userResult.rows[0];

    // 3. NEW TOKEN WITH companyId
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token: newToken,
      user,
      company
    });

  } catch (error) {
    console.error('Create company error:', error);
    return res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});


// 🆕 GET CURRENT USER COMPANY
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.companyId) {
      return res.status(404).json({ error: 'No company' });
    }

    const result = await query(
      `SELECT * FROM companies WHERE id = $1`,
      [decoded.companyId]
    );

    return res.json(result.rows[0]);

  } catch (err) {
    console.error('Get company error:', err);
   res.status(500).json({
  error: "REAL_ERROR",
  message: err.message
});
  }
});

module.exports = router;