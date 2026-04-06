const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// ✅ DASHBOARD SUMMARY (your existing one)
//
router.get('/', authenticateToken, async (req, res) => {
  try {
    const totalShifts = await query(`SELECT COUNT(*) FROM shifts`);
    const totalUsers = await query(`SELECT COUNT(*) FROM users`);
    const totalTasks = await query(`SELECT COUNT(*) FROM tasks`);

    res.json({
      totalShifts: parseInt(totalShifts.rows[0].count),
      totalUsers: parseInt(totalUsers.rows[0].count),
      totalTasks: parseInt(totalTasks.rows[0].count)
    });

  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

//
// ✅ NEW: TIMESHEET EXPORT
//
router.get('/timesheets', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        users.name,
        users.email,
        shifts.clock_in_time,
        shifts.clock_out_time,
        EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 3600 AS hours
      FROM shifts
      JOIN users ON users.id = shifts.user_id
      WHERE shifts.clock_out_time IS NOT NULL
      ORDER BY shifts.clock_in_time DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('Timesheet error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

module.exports = router;