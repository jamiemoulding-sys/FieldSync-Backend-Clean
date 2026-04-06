const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// ✅ GET ALL COMPLETIONS
//
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM task_completions
      ORDER BY completed_at DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

module.exports = router;