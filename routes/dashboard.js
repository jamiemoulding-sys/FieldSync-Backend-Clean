const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// 📊 DASHBOARD (COMPANY SAFE 🔥)
//
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(403).json({ error: "No company assigned" });
    }

    // 👥 total users
    const usersRes = await query(
      `SELECT COUNT(*) FROM users WHERE company_id = $1`,
      [companyId]
    );

    // ⏱ active shifts
    const activeShiftsRes = await query(
      `SELECT COUNT(*) FROM shifts 
       WHERE company_id = $1 AND clock_out_time IS NULL`,
      [companyId]
    );

    // 📋 total tasks
    const tasksRes = await query(
      `SELECT COUNT(*) FROM tasks WHERE company_id = $1`,
      [companyId]
    );

    // 📊 completed tasks
    const completedRes = await query(
      `SELECT COUNT(*) FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE t.company_id = $1`,
      [companyId]
    );

    res.json({
      users: parseInt(usersRes.rows[0].count),
      activeShifts: parseInt(activeShiftsRes.rows[0].count),
      tasks: parseInt(tasksRes.rows[0].count),
      completedTasks: parseInt(completedRes.rows[0].count)
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