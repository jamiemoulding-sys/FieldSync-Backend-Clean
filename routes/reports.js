const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const { authenticateToken } = require("../middleware/auth");

/*
========================================
🔒 ADMIN ONLY CHECK
========================================
*/
function adminOnly(req, res) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({
      error: "Forbidden",
    });
    return false;
  }

  return true;
}

/*
========================================
📊 REPORT SUMMARY
GET /api/reports
========================================
*/
router.get("/", authenticateToken, async (req, res) => {
  try {
    if (!adminOnly(req, res)) return;

    const companyId = req.user.companyId;

    const [
      shiftsRes,
      usersRes,
      tasksRes,
      completedTasksRes,
      activeUsersRes,
      hoursWorkedRes,
    ] = await Promise.all([
      query(
        `
        SELECT COUNT(*) 
        FROM shifts
        WHERE company_id = $1
      `,
        [companyId]
      ),

      query(
        `
        SELECT COUNT(*) 
        FROM users
        WHERE company_id = $1
      `,
        [companyId]
      ),

      query(
        `
        SELECT COUNT(*)
        FROM tasks
        WHERE company_id = $1
      `,
        [companyId]
      ),

      query(
        `
        SELECT COUNT(*)
        FROM tasks
        WHERE company_id = $1
        AND completed = true
      `,
        [companyId]
      ),

      query(
        `
        SELECT COUNT(DISTINCT user_id)
        FROM shifts
        WHERE company_id = $1
        AND DATE(clock_in_time) = CURRENT_DATE
      `,
        [companyId]
      ),

      query(
        `
        SELECT COALESCE(
          ROUND(
            SUM(
              EXTRACT(
                EPOCH FROM (
                  COALESCE(clock_out_time, NOW()) - clock_in_time
                )
              ) / 3600
            )
          ),0
        ) AS total
        FROM shifts
        WHERE company_id = $1
      `,
        [companyId]
      ),
    ]);

    res.json({
      totalShifts: Number(shiftsRes.rows[0].count),
      totalUsers: Number(usersRes.rows[0].count),
      totalTasks: Number(tasksRes.rows[0].count),
      completedTasks: Number(
        completedTasksRes.rows[0].count
      ),
      activeUsers: Number(
        activeUsersRes.rows[0].count
      ),
      hoursWorked: Number(
        hoursWorkedRes.rows[0].total
      ),
    });
  } catch (error) {
    console.error("Reports error:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/*
========================================
📄 TIMESHEETS
GET /api/reports/timesheets
========================================
*/
router.get(
  "/timesheets",
  authenticateToken,
  async (req, res) => {
    try {
      if (!adminOnly(req, res)) return;

      const companyId = req.user.companyId;

      const result = await query(
        `
        SELECT
          users.name,
          users.email,
          shifts.clock_in_time,
          shifts.clock_out_time,
          ROUND(
            EXTRACT(
              EPOCH FROM (
                COALESCE(
                  shifts.clock_out_time,
                  NOW()
                ) - shifts.clock_in_time
              )
            ) / 3600, 2
          ) AS hours
        FROM shifts
        JOIN users
          ON users.id = shifts.user_id
        WHERE shifts.company_id = $1
        ORDER BY shifts.clock_in_time DESC
        LIMIT 200
      `,
        [companyId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Timesheet error:",
        error
      );

      res.status(500).json({
        error: error.message,
      });
    }
  }
);

module.exports = router;