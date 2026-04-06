const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        u.id,
        u.name,

        COUNT(s.id) FILTER (WHERE s.clock_in_time IS NOT NULL) as total_shifts,

        COUNT(s.id) FILTER (
          WHERE s.clock_in_time > sch.start_time
        ) as late_count,

        COUNT(sch.id) FILTER (
          WHERE s.id IS NULL AND sch.date = CURRENT_DATE
        ) as missed_shifts,

        COALESCE(SUM(
          EXTRACT(EPOCH FROM (s.clock_out_time - s.clock_in_time)) / 3600
        ), 0) as total_hours

      FROM users u
      LEFT JOIN schedules sch ON sch.user_id = u.id
      LEFT JOIN shifts s 
        ON s.user_id = u.id 
        AND DATE(s.clock_in_time) = sch.date

      GROUP BY u.id, u.name
      ORDER BY u.name ASC
    `);

    const data = result.rows.map(u => {
      const latenessRate = u.total_shifts > 0
        ? (u.late_count / u.total_shifts) * 100
        : 0;

      const reliability =
        100 -
        latenessRate -
        (u.missed_shifts * 10);

      return {
        ...u,
        latenessRate: Math.round(latenessRate),
        reliability: Math.max(0, Math.round(reliability))
      };
    });

    res.json(data);

  } catch (err) {
    console.error('PERFORMANCE ERROR:', err);
    res.status(500).json({
  error: "REAL_ERROR",
  message: err.message
});
  }
});

module.exports = router;