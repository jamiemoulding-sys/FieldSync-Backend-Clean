const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(403).json({ error: "No company assigned" });
    }

    // ======================
    // 📊 CORE STATS
    // ======================
    const [
      usersRes,
      activeShiftsRes,
      tasksRes,
      completedRes,
      holidayRes
    ] = await Promise.all([

      query(`SELECT COUNT(*) FROM users WHERE company_id = $1`, [companyId]),

      query(`SELECT COUNT(*) FROM shifts
             WHERE company_id = $1 AND clock_out_time IS NULL`, [companyId]),

      query(`SELECT COUNT(*) FROM tasks WHERE company_id = $1`, [companyId]),

      query(`SELECT COUNT(*) FROM task_completions tc
             JOIN tasks t ON tc.task_id = t.id
             WHERE t.company_id = $1`, [companyId]),

      query(`SELECT COUNT(*) FROM holidays h
             JOIN users u ON h.user_id = u.id
             WHERE u.company_id = $1 AND h.status = 'pending'`, [companyId])
    ]);

    // ======================
    // 📈 HOURS (LAST 7 DAYS)
    // ======================
    const hoursRes = await query(`
      SELECT
        DATE(clock_in_time) as date,
        SUM(
          EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600
        ) as hours
      FROM shifts
      WHERE company_id = $1
      AND clock_in_time >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(clock_in_time)
      ORDER BY DATE(clock_in_time)
    `, [companyId]);

    // ======================
    // 🚨 LATE RATE (SAFE FIX)
    // ======================
    const lateRes = await query(`
      SELECT
        COUNT(*) FILTER (WHERE is_late = true) as late,
        COUNT(*) as total
      FROM shifts
      WHERE company_id = $1
    `, [companyId]);

    const late = Number(lateRes.rows[0].late || 0);
    const total = Number(lateRes.rows[0].total || 0);

    const lateRate = total > 0
      ? Math.round((late / total) * 100)
      : 0;

    // ======================
    // 🏆 TOP PERFORMERS
    // ======================
    const topUsersRes = await query(`
      SELECT u.name, COUNT(tc.id) as completed
      FROM task_completions tc
      JOIN users u ON u.id = tc.user_id
      WHERE u.company_id = $1
      GROUP BY u.name
      ORDER BY completed DESC
      LIMIT 5
    `, [companyId]);

    // ======================
    // 📜 ACTIVITY FEED
    // ======================
    const activityRes = await query(`
      SELECT a.*, u.name
      FROM activity_logs a
      JOIN users u ON u.id = a.user_id
      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT 15
    `, [companyId]);

    // ======================
    // 🚀 RESPONSE (FINAL SHAPE)
    // ======================
    res.json({
      stats: {
        users: parseInt(usersRes.rows[0].count),
        activeShifts: parseInt(activeShiftsRes.rows[0].count),
        tasks: parseInt(tasksRes.rows[0].count),
        completedTasks: parseInt(completedRes.rows[0].count),
        pendingHolidays: parseInt(holidayRes.rows[0].count),
        lateRate
      },

      trends: {
        hours: hoursRes.rows
      },

      topPerformers: topUsersRes.rows || [],

      activity: activityRes.rows || []
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