const express = require('express');
const router = express.Router();

const {
  authenticateToken,
  requireRole,
  requireCompany
} = require('../middleware/auth');

const { query } = require('../database/connection');

//
// =======================
// 📅 GET ALL SCHEDULES
// =======================
router.get('/',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT s.*, u.name
        FROM schedules s
        JOIN users u ON u.id = s.user_id
        WHERE u.company_id = $1
        ORDER BY s.date DESC
      `, [req.user.companyId]);

      res.json(result.rows);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch schedules' });
    }
  }
);

//
// =======================
// 👤 MY SCHEDULE
// =======================
router.get('/my-schedule',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT *
        FROM schedules
        WHERE user_id = $1
        ORDER BY date DESC
      `, [req.user.id]);

      res.json(result.rows);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch schedule' });
    }
  }
);

//
// =======================
// ➕ CREATE SCHEDULE
// =======================
router.post('/',
  authenticateToken,
  requireCompany,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const { user_id, date, start_time, end_time } = req.body;

      if (!user_id || !date || !start_time || !end_time) {
        return res.status(400).json({ error: "All fields required" });
      }

      // 🔒 validate user belongs to company
      const userCheck = await query(
        `SELECT id FROM users WHERE id = $1 AND company_id = $2`,
        [user_id, req.user.companyId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Invalid user for this company'
        });
      }

      // 🚨 PREVENT DUPLICATE SHIFTS
      const existing = await query(
        `SELECT id FROM schedules
         WHERE user_id = $1 AND date = $2`,
        [user_id, date]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({
          error: 'User already has a shift that day'
        });
      }

      const result = await query(`
        INSERT INTO schedules (user_id, date, start_time, end_time, company_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [user_id, date, start_time, end_time, req.user.companyId]);

      // 🧠 ACTIVITY LOG
      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Created shift for user ${user_id} on ${date}`
        ]
      );

      res.status(201).json(result.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Create failed' });
    }
  }
);

//
// =======================
// 🚀 BULK CREATE (THIS FIXES YOUR MAIN PAIN)
// =======================
router.post('/bulk',
  authenticateToken,
  requireCompany,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const { shifts } = req.body;

      if (!Array.isArray(shifts) || shifts.length === 0) {
        return res.status(400).json({
          error: 'Shifts array required'
        });
      }

      const created = [];

      for (const s of shifts) {
        const { user_id, date, start_time, end_time } = s;

        // skip invalid
        if (!user_id || !date) continue;

        // prevent duplicates
        const exists = await query(
          `SELECT id FROM schedules WHERE user_id=$1 AND date=$2`,
          [user_id, date]
        );

        if (exists.rows.length > 0) continue;

        const result = await query(
          `INSERT INTO schedules
           (user_id, date, start_time, end_time, company_id)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING *`,
          [
            user_id,
            date,
            start_time,
            end_time,
            req.user.companyId
          ]
        );

        created.push(result.rows[0]);
      }

      res.json({
        created: created.length,
        data: created
      });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Bulk insert failed' });
    }
  }
);

//
// =======================
// ✏️ UPDATE
// =======================
router.put('/:id',
  authenticateToken,
  requireCompany,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const { start_time, end_time } = req.body;

      const result = await query(`
        UPDATE schedules
        SET start_time = $1,
            end_time = $2
        WHERE id = $3
        AND company_id = $4
        RETURNING *
      `, [
        start_time,
        end_time,
        req.params.id,
        req.user.companyId
      ]);

      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Schedule not found'
        });
      }

      res.json(result.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Update failed' });
    }
  }
);

//
// =======================
// ❌ DELETE
// =======================
router.delete('/:id',
  authenticateToken,
  requireCompany,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await query(
        `DELETE FROM schedules
         WHERE id = $1 AND company_id = $2
         RETURNING id`,
        [req.params.id, req.user.companyId]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Schedule not found'
        });
      }

      res.json({ message: 'Deleted' });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Delete failed' });
    }
  }
);

//
// =======================
// 🚨 LATE ARRIVALS (FIXED)
// =======================
router.get('/late-arrivals',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT u.name, s.date, s.start_time, sh.clock_in_time
        FROM schedules s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN shifts sh 
          ON sh.user_id = s.user_id
          AND DATE(sh.clock_in_time) = s.date
        WHERE u.company_id = $1
        AND sh.clock_in_time IS NOT NULL
        AND sh.clock_in_time > s.start_time
      `, [req.user.companyId]);

      res.json(result.rows);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Late arrivals failed' });
    }
  }
);

//
// =======================
// 📅 HOLIDAY REQUESTS (FIXED)
// =======================

// CREATE
router.post('/holiday-requests',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const { start_date, end_date } = req.body;

      if (!start_date || !end_date) {
        return res.status(400).json({ error: "Dates required" });
      }

      const result = await query(`
        INSERT INTO holidays 
        (user_id, start_date, end_date, status, company_id)
        VALUES ($1, $2, $3, 'pending', $4)
        RETURNING *
      `, [req.user.id, start_date, end_date, req.user.companyId]);

      res.status(201).json(result.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Create failed' });
    }
  }
);

// GET ALL
router.get('/holiday-requests',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(`
        SELECT h.*, u.name
        FROM holidays h
        JOIN users u ON u.id = h.user_id
        WHERE h.company_id = $1
        ORDER BY h.start_date DESC
      `, [req.user.companyId]);

      res.json(result.rows);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Fetch failed' });
    }
  }
);

// UPDATE STATUS
router.put('/holiday-requests/:id',
  authenticateToken,
  requireCompany,
  requireRole('admin', 'manager'),
  async (req, res) => {
    try {
      const { status } = req.body;

      const result = await query(`
        UPDATE holidays
        SET status = $1
        WHERE id = $2 AND company_id = $3
        RETURNING *
      `, [status, req.params.id, req.user.companyId]);

      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Holiday not found'
        });
      }

      res.json(result.rows[0]);

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Update failed' });
    }
  }
);

// DELETE
router.delete('/holiday-requests/:id',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      await query(
        `DELETE FROM holidays
         WHERE id = $1 AND company_id = $2`,
        [req.params.id, req.user.companyId]
      );

      res.json({ message: 'Deleted' });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Delete failed' });
    }
  }
);

module.exports = router;