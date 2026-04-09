const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// =======================
// 🔥 ACTIVITY LOGGER (SAFE)
// =======================
const logActivity = async (userId, companyId, action, metadata = {}) => {
  try {
    await query(`
      INSERT INTO activity_logs (user_id, company_id, action, metadata)
      VALUES ($1, $2, $3, $4)
    `, [userId, companyId, action, JSON.stringify(metadata)]);
  } catch (err) {
    console.error("❌ Activity log failed:", err.message);
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

    // 🔹 Get active shift
    const shiftRes = await query(`
      SELECT location_id FROM shifts
      WHERE user_id = $1
      AND company_id = $2
      AND clock_out_time IS NULL
      LIMIT 1
    `, [userId, companyId]);

    if (shiftRes.rows.length === 0) {
      return res.json([]);
    }

    const locationId = shiftRes.rows[0].location_id;

    // 🔹 Get tasks (scoped properly)
    const result = await query(`
      SELECT *
      FROM tasks
      WHERE location_id = $1
      AND company_id = $2
      AND is_active = true
      ORDER BY id DESC
    `, [locationId, companyId]);

    return res.json(result.rows);

  } catch (error) {
    console.error('GET TASKS ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// ➕ CREATE TASK
// =======================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, location_id } = req.body;
    const companyId = req.user.companyId;

    if (!title || !location_id) {
      return res.status(400).json({
        error: "Title and location are required"
      });
    }

    // 🔹 Validate location belongs to company
    const locationCheck = await query(
      `SELECT id FROM locations WHERE id = $1 AND company_id = $2`,
      [location_id, companyId]
    );

    if (locationCheck.rows.length === 0) {
      return res.status(403).json({
        error: "Invalid location"
      });
    }

    const result = await query(`
      INSERT INTO tasks (title, description, location_id, company_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [title, description || null, location_id, companyId]);

    // 🔥 LOG ACTIVITY
    await logActivity(req.user.id, companyId, 'task_created', {
      title
    });

    return res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('CREATE TASK ERROR:', error);
    return res.status(500).json({
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

    if (!task_id) {
      return res.status(400).json({
        error: "Task ID required"
      });
    }

    // 🔹 Validate task belongs to company
    const taskCheck = await query(
      `SELECT id, title FROM tasks WHERE id = $1 AND company_id = $2`,
      [task_id, companyId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(403).json({
        error: "Invalid task"
      });
    }

    const taskName = taskCheck.rows[0].title;

    // 🔹 Get active shift
    const shiftRes = await query(`
      SELECT id FROM shifts
      WHERE user_id = $1
      AND company_id = $2
      AND clock_out_time IS NULL
      LIMIT 1
    `, [userId, companyId]);

    if (shiftRes.rows.length === 0) {
      return res.status(400).json({
        error: 'No active shift'
      });
    }

    const shiftId = shiftRes.rows[0].id;

    // 🔹 Prevent duplicate completion
    const existing = await query(`
      SELECT id FROM task_completions
      WHERE task_id = $1
      AND user_id = $2
      AND shift_id = $3
    `, [task_id, userId, shiftId]);

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'Already completed'
      });
    }

    // 🔹 Insert completion
    await query(`
      INSERT INTO task_completions (task_id, user_id, shift_id)
      VALUES ($1, $2, $3)
    `, [task_id, userId, shiftId]);

    // 🔥 LOG ACTIVITY
    await logActivity(userId, companyId, 'task_completed', {
      task: taskName
    });

    return res.json({ success: true });

  } catch (error) {
    console.error('COMPLETE TASK ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

module.exports = router;