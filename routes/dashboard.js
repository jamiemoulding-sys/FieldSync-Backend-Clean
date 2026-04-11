const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const {
  authenticateToken,
} = require("../middleware/auth");

//
// ===================================
// 📊 FULL FIX DASHBOARD ROUTE
// ===================================

router.get(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const companyId =
        req.user.companyId;

      if (!companyId) {
        return res.status(403).json({
          error:
            "No company assigned",
        });
      }

      const safeQuery = async (
        sql,
        params = []
      ) => {
        try {
          return await query(
            sql,
            params
          );
        } catch {
          return {
            rows: [],
          };
        }
      };

      const [
        usersRes,
        activeShiftsRes,
        tasksRes,
        holidayRes,
        shiftsTodayRes,
        hoursTodayRes,
        lateTodayRes,
      ] = await Promise.all([
        safeQuery(
          `
          SELECT COUNT(*) FROM users
          WHERE company_id = $1
          `,
          [companyId]
        ),

        safeQuery(
          `
          SELECT COUNT(*) FROM shifts
          WHERE company_id = $1
          AND clock_out_time IS NULL
          `,
          [companyId]
        ),

        safeQuery(
          `
          SELECT COUNT(*) FROM tasks
          WHERE company_id = $1
          `,
          [companyId]
        ),

        safeQuery(
          `
          SELECT COUNT(*) FROM holidays h
          JOIN users u
          ON h.user_id = u.id
          WHERE u.company_id = $1
          AND h.status = 'pending'
          `,
          [companyId]
        ),

        safeQuery(
          `
          SELECT COUNT(*) FROM shifts
          WHERE company_id = $1
          AND DATE(clock_in_time) = CURRENT_DATE
          `,
          [companyId]
        ),

        safeQuery(
          `
          SELECT COALESCE(
            SUM(
              EXTRACT(
                EPOCH FROM (
                  COALESCE(
                    clock_out_time,
                    NOW()
                  ) - clock_in_time
                )
              ) / 3600
            ),0
          ) AS total
          FROM shifts
          WHERE company_id = $1
          AND DATE(clock_in_time) = CURRENT_DATE
          `,
          [companyId]
        ),

        safeQuery(
          `
          SELECT COUNT(*) FROM shifts
          WHERE company_id = $1
          AND DATE(clock_in_time) = CURRENT_DATE
          AND is_late = true
          `,
          [companyId]
        ),
      ]);

      const hoursRes =
        await safeQuery(
          `
          SELECT
            DATE(clock_in_time) AS date,
            ROUND(
              SUM(
                EXTRACT(
                  EPOCH FROM (
                    COALESCE(
                      clock_out_time,
                      NOW()
                    ) - clock_in_time
                  )
                ) / 3600
              )
            ) AS hours
          FROM shifts
          WHERE company_id = $1
          AND clock_in_time >= NOW() - INTERVAL '7 days'
          GROUP BY DATE(clock_in_time)
          ORDER BY DATE(clock_in_time)
          `,
          [companyId]
        );

      const topUsersRes =
        await safeQuery(
          `
          SELECT
            u.name,
            COUNT(s.id) AS shifts
          FROM shifts s
          JOIN users u
          ON u.id = s.user_id
          WHERE u.company_id = $1
          GROUP BY u.name
          ORDER BY shifts DESC
          LIMIT 5
          `,
          [companyId]
        );

      const activityRes =
        await safeQuery(
          `
          SELECT
            a.*,
            u.name
          FROM activity_logs a
          JOIN users u
          ON u.id = a.user_id
          WHERE a.company_id = $1
          ORDER BY a.created_at DESC
          LIMIT 10
          `,
          [companyId]
        );

      const getCount = (
        result
      ) =>
        Number(
          result?.rows?.[0]
            ?.count || 0
        );

      const getTotal = (
        result
      ) =>
        Number(
          result?.rows?.[0]
            ?.total || 0
        );

      const late =
        getCount(
          lateTodayRes
        );

      const active =
        getCount(
          activeShiftsRes
        );

      const holidays =
        getCount(
          holidayRes
        );

      const aiFeed = [];

      if (late > 0) {
        aiFeed.push(
          `🚨 ${late} employees late today`
        );
      }

      if (active < 2) {
        aiFeed.push(
          "⚠️ Low staffing levels right now"
        );
      }

      if (holidays > 0) {
        aiFeed.push(
          `📨 ${holidays} holiday requests pending`
        );
      }

      if (
        aiFeed.length === 0
      ) {
        aiFeed.push(
          "✅ Operations running smoothly"
        );
      }

      return res.json({
        stats: {
          users:
            getCount(
              usersRes
            ),
          activeShifts:
            active,
          tasks:
            getCount(
              tasksRes
            ),
          pendingHolidays:
            holidays,
          shiftsToday:
            getCount(
              shiftsTodayRes
            ),
          hoursToday:
            Math.round(
              getTotal(
                hoursTodayRes
              )
            ),
          late,
          issues: late,
        },

        trends: {
          hours:
            hoursRes.rows ||
            [],
        },

        topPerformers:
          topUsersRes.rows ||
          [],

        activity:
          activityRes.rows ||
          [],

        aiFeed,
      });
    } catch (error) {
      console.error(
        "DASHBOARD ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to load dashboard",
      });
    }
  }
);

module.exports = router;