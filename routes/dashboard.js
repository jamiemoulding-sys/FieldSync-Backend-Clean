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

    const [
      usersRes,
      activeShiftsRes,
      tasksRes,
      holidayRes,
      shiftsTodayRes,
      hoursTodayRes,
      lateTodayRes
    ] = await Promise.all([

      query(`SELECT COUNT(*) FROM users WHERE company_id = $1`, [companyId]),

      query(`
        SELECT COUNT(*) FROM shifts
        WHERE company_id = $1
        AND clock_out_time IS NULL
      `, [companyId]),

      query(`
        SELECT COUNT(*) FROM tasks
        WHERE company_id = $1
      `, [companyId]),

      query(`
        SELECT COUNT(*) FROM holidays h
        JOIN users u ON h.user_id = u.id
        WHERE u.company_id = $1
        AND h.status = 'pending'
      `, [companyId]),

      query(`
        SELECT COUNT(*) FROM shifts
        WHERE company_id = $1
        AND DATE(clock_in_time) = CURRENT_DATE
      `, [companyId]),

      query(`
        SELECT COALESCE(SUM(
          EXTRACT(EPOCH FROM (
            COALESCE(clock_out_time, NOW()) - clock_in_time
          )) / 3600
        ),0) as total
        FROM shifts
        WHERE company_id = $1
        AND DATE(clock_in_time) = CURRENT_DATE
      `, [companyId]),

      query(`
        SELECT COUNT(*) FROM shifts
        WHERE company_id = $1
        AND DATE(clock_in_time) = CURRENT_DATE
        AND is_late = true
      `, [companyId])
    ]);

    // WEEKLY HOURS
    const hoursRes = await query(`
      SELECT
        DATE(clock_in_time) as date,
        ROUND(SUM(
          EXTRACT(EPOCH FROM (
            COALESCE(clock_out_time, NOW()) - clock_in_time
          )) / 3600
        )) as hours
      FROM shifts
      WHERE company_id = $1
      AND clock_in_time >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(clock_in_time)
      ORDER BY DATE(clock_in_time)
    `, [companyId]);

    // TOP USERS (attendance based)
    const topUsersRes = await query(`
      SELECT
        u.name,
        COUNT(s.id) as shifts
      FROM shifts s
      JOIN users u ON u.id = s.user_id
      WHERE u.company_id = $1
      GROUP BY u.name
      ORDER BY shifts DESC
      LIMIT 5
    `, [companyId]);

    // ACTIVITY
    const activityRes = await query(`
      SELECT a.*, u.name
      FROM activity_logs a
      JOIN users u ON u.id = a.user_id
      WHERE a.company_id = $1
      ORDER BY a.created_at DESC
      LIMIT 10
    `, [companyId]);

    // AI FEED
    const aiFeed = [];

    if (Number(lateTodayRes.rows[0].count) > 0) {
      aiFeed.push(`🚨 ${lateTodayRes.rows[0].count} employees late today`);
    }

    if (Number(activeShiftsRes.rows[0].count) < 2) {
      aiFeed.push(`⚠️ Low staffing levels right now`);
    }

    if (Number(holidayRes.rows[0].count) > 0) {
      aiFeed.push(`📨 ${holidayRes.rows[0].count} holiday requests pending`);
    }

    if (aiFeed.length === 0) {
      aiFeed.push(`✅ Operations running smoothly`);
    }

    res.json({
      stats: {
        users: Number(usersRes.rows[0].count),
        activeShifts: Number(activeShiftsRes.rows[0].count),
        tasks: Number(tasksRes.rows[0].count),
        pendingHolidays: Number(holidayRes.rows[0].count),
        shiftsToday: Number(shiftsTodayRes.rows[0].count),
        hoursToday: Math.round(Number(hoursTodayRes.rows[0].total)),
        late: Number(lateTodayRes.rows[0].count),
        issues: Number(lateTodayRes.rows[0].count)
      },

      trends: {
        hours: hoursRes.rows
      },

      topPerformers: topUsersRes.rows,

      activity: activityRes.rows,

      aiFeed
    });

  } catch (error) {
    console.error('DASHBOARD ERROR:', error);

    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;