const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// =======================
// 🔥 ACTIVITY LOGGER
// =======================
const logActivity = async (userId, companyId, action, metadata = {}) => {
  try {
    await query(`
      INSERT INTO activity_logs (user_id, company_id, action, metadata)
      VALUES ($1, $2, $3, $4)
    `, [userId, companyId, action, JSON.stringify(metadata)]);
  } catch (err) {
    console.error("Activity log failed:", err.message);
  }
};

//
// =======================
// ✅ GET TASKS (COMPANY SAFE)
// =======================
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    // 🔥 get active shift (scoped)
    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE user_id = $1
      AND company_id = $2
      AND clock_out_time IS NULL
      LIMIT 1
    `, [userId, companyId]);

    if (shiftRes.rows.length === 0) {
      return res.json([]);
    }

    const locationId = shiftRes.rows[0].location_id;

    // 🔥 tasks scoped by location + company
    const result = await query(`
      SELECT * FROM tasks
      WHERE location_id = $1
      AND company_id = $2
      AND is_active = true
      ORDER BY id DESC
    `, [locationId, companyId]);

    res.json(result.rows);

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// ➕ CREATE TASK (ADMIN / MANAGER)
// =======================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, location_id } = req.body;

    const result = await query(`
      INSERT INTO tasks (title, description, location_id, company_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [title, description, location_id, req.user.companyId]);

    // 🔥 LOG ACTIVITY
    await logActivity(req.user.id, req.user.companyId, 'task_created', {
      title
    });

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// ✅ COMPLETE TASK
// =======================
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const { task_id } = req.body;

    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE user_id = $1
      AND company_id = $2
      AND clock_out_time IS NULL
      LIMIT 1
    `, [userId, companyId]);

    if (shiftRes.rows.length === 0) {
      return res.status(400).json({ error: 'No active shift' });
    }

    const shiftId = shiftRes.rows[0].id;

    const existing = await query(`
      SELECT * FROM task_completions
      WHERE task_id = $1
      AND user_id = $2
      AND shift_id = $3
    `, [task_id, userId, shiftId]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already completed' });
    }

    await query(`
      INSERT INTO task_completions (task_id, user_id, shift_id)
      VALUES ($1, $2, $3)
    `, [task_id, userId, shiftId]);

    // 🔥 GET TASK NAME FOR LOG
    const taskRes = await query(
      `SELECT title FROM tasks WHERE id = $1`,
      [task_id]
    );

    const taskName = taskRes.rows[0]?.title || 'Task';

    // 🔥 LOG ACTIVITY
    await logActivity(userId, companyId, 'task_completed', {
      task: taskName
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

module.exports = router;