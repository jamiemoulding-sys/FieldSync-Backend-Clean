const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const { authenticateToken } = require("../middleware/auth");

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
        u.name,
        u.email,

        COUNT(DISTINCT s.id) FILTER (
          WHERE s.clock_in_time IS NOT NULL
        ) AS total_shifts,

        COUNT(DISTINCT s.id) FILTER (
          WHERE sch.id IS NOT NULL
          AND s.clock_in_time > sch.start_time
        ) AS late_count,

        COUNT(DISTINCT sch.id) FILTER (
          WHERE sch.date = CURRENT_DATE
          AND s.id IS NULL
        ) AS missed_shifts,

        COALESCE(
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
        ) AS hours_worked,

        COALESCE(
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.completed_by = u.id
          ),
          0
        ) AS completed_tasks

      FROM users u

      LEFT JOIN schedules sch
        ON sch.user_id = u.id
        AND sch.company_id = $1

      LEFT JOIN shifts s
        ON s.user_id = u.id
        AND s.company_id = $1
        AND (
          sch.id IS NULL
          OR DATE(s.clock_in_time) = sch.date
        )

      WHERE u.company_id = $1

      GROUP BY
        u.id,
        u.name,
        u.email

      ORDER BY u.name ASC
    `,
      [companyId]
    );

    const data = result.rows.map((u) => {
      const totalShifts = Number(
        u.total_shifts || 0
      );

      const lateCount = Number(
        u.late_count || 0
      );

      const missed = Number(
        u.missed_shifts || 0
      );

      const completed = Number(
        u.completed_tasks || 0
      );

      const hoursWorked = Number(
        u.hours_worked || 0
      );

      const latenessRate =
        totalShifts > 0
          ? (lateCount / totalShifts) * 100
          : 0;

      let reliability =
        100 -
        latenessRate -
        missed * 12;

      if (reliability < 0) {
        reliability = 0;
      }

      const score = Math.min(
        Math.round(
          totalShifts * 10 +
            completed * 4 +
            hoursWorked -
            lateCount * 6 -
            missed * 10
        ),
        100
      );

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
        score: Math.max(0, score),
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