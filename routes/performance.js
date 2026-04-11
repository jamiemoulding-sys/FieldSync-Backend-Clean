const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const { authenticateToken } = require("../middleware/auth");

/* ===================================
   📊 PERFORMANCE
=================================== */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(403).json({
        error: "No company assigned",
      });
    }

    const result = await query(
      `
      SELECT
        u.id,
        COALESCE(u.name,'User') AS name,
        u.email,

        /* shifts worked */
        (
          SELECT COUNT(*)
          FROM shifts s
          WHERE s.user_id = u.id
          AND s.company_id = $1
        ) AS total_shifts,

        /* late shifts */
        (
          SELECT COUNT(*)
          FROM shifts s
          WHERE s.user_id = u.id
          AND s.company_id = $1
          AND s.is_late = true
        ) AS late_count,

        /* missed schedules */
        (
          SELECT COUNT(*)
          FROM schedules sch
          WHERE sch.user_id = u.id
          AND sch.company_id = $1
          AND sch.date < CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1
            FROM shifts s
            WHERE s.user_id = u.id
            AND DATE(s.clock_in_time) = sch.date
          )
        ) AS missed_shifts,

        /* total worked hours */
        (
          SELECT COALESCE(
            SUM(
              EXTRACT(
                EPOCH FROM (
                  COALESCE(
                    s.clock_out_time,
                    NOW()
                  ) - s.clock_in_time
                )
              ) / 3600
            ),
            0
          )
          FROM shifts s
          WHERE s.user_id = u.id
          AND s.company_id = $1
        ) AS hours_worked,

        /* completed tasks */
        (
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.company_id = $1
          AND (
            t.assigned_to = u.id
            OR t.user_id = u.id
            OR t.created_by = u.id
          )
          AND (
            t.completed = true
            OR t.status = 'completed'
          )
        ) AS completed_tasks

      FROM users u
      WHERE u.company_id = $1
      ORDER BY name ASC
      `,
      [companyId]
    );

    const data = result.rows.map((u) => {
      const totalShifts = Number(u.total_shifts || 0);
      const lateCount = Number(u.late_count || 0);
      const missed = Number(u.missed_shifts || 0);
      const completed = Number(u.completed_tasks || 0);
      const hoursWorked = Number(u.hours_worked || 0);

      const latenessRate =
        totalShifts > 0
          ? (lateCount / totalShifts) * 100
          : 0;

      let reliability =
        100 -
        latenessRate -
        missed * 10;

      if (reliability < 0) reliability = 0;

      let score =
        totalShifts * 8 +
        completed * 5 +
        hoursWorked -
        lateCount * 6 -
        missed * 10;

      if (score > 100) score = 100;
      if (score < 0) score = 0;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        total_shifts: totalShifts,
        late_count: lateCount,
        missed_shifts: missed,
        completed_tasks: completed,
        hours_worked: Number(
          hoursWorked.toFixed(1)
        ),
        latenessRate: Math.round(
          latenessRate
        ),
        reliability: Math.round(
          reliability
        ),
        score: Math.round(score),
      };
    });

    data.sort(
      (a, b) => b.score - a.score
    );

    res.json(data);
  } catch (err) {
    console.error(
      "PERFORMANCE ERROR:",
      err
    );

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;