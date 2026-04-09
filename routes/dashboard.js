const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// 📊 DASHBOARD (ENTERPRISE VERSION 🔥)
//
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(403).json({ error: "No company assigned" });
    }

    // 👥 USERS
    const usersRes = await query(
      `SELECT COUNT(*) FROM users WHERE company_id = $1`,
      [companyId]
    );

    // ⏱ ACTIVE SHIFTS
    const activeShiftsRes = await query(
      `SELECT COUNT(*) FROM shifts
       WHERE company_id = $1 AND clock_out_time IS NULL`,
      [companyId]
    );

    // 📋 TASKS
    const tasksRes = await query(
      `SELECT COUNT(*) FROM tasks WHERE company_id = $1`,
      [companyId]
    );

    // ✅ COMPLETED TASKS
    const completedRes = await query(
      `SELECT COUNT(*) FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE t.company_id = $1`,
      [companyId]
    );

    // 🌴 HOLIDAY PENDING
    const holidayRes = await query(
      `SELECT COUNT(*) FROM holidays h
       JOIN users u ON h.user_id = u.id
       WHERE u.company_id = $1 AND h.status = 'pending'`,
      [companyId]
    );

    // 📜 ACTIVITY FEED (LAST 10)
    const activityRes = await query(`
      SELECT a.*, u.name
      FROM activity_logs a
      JOIN users u ON u.id = a.user_id
      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT 10
    `, [companyId]);

    res.json({
      stats: {
        users: parseInt(usersRes.rows[0].count),
        activeShifts: parseInt(activeShiftsRes.rows[0].count),
        tasks: parseInt(tasksRes.rows[0].count),
        completedTasks: parseInt(completedRes.rows[0].count),
        pendingHolidays: parseInt(holidayRes.rows[0].count)
      },
      activity: activityRes.rows
    });

  } catch (error) {
    console.error('DASHBOARD ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

module.exports = router;