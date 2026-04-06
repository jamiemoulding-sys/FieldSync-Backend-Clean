const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

//
// ✅ GET TASKS (BY ACTIVE SHIFT LOCATION)
//
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // get active shift
    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE user_id = $1 AND clock_out_time IS NULL
      LIMIT 1
    `, [userId]);

    if (shiftRes.rows.length === 0) {
      return res.json([]);
    }

    const locationId = shiftRes.rows[0].location_id;

    // get tasks for that location
    const result = await query(`
      SELECT * FROM tasks
      WHERE location_id = $1 AND is_active = true
      ORDER BY id DESC
    `, [locationId]);

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
// ✅ CREATE TASK
//
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, location_id } = req.body;

    const result = await query(`
      INSERT INTO tasks (title, description, location_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [title, description, location_id]);

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// COMPLETE TASK
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { task_id } = req.body;

    // ✅ get active shift
    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE user_id = $1 AND clock_out_time IS NULL
      LIMIT 1
    `, [userId]);

    if (shiftRes.rows.length === 0) {
      return res.status(400).json({ error: 'No active shift' });
    }

    const shiftId = shiftRes.rows[0].id;

    // ✅ prevent duplicate completion
    const existing = await query(`
      SELECT * FROM task_completions
      WHERE task_id = $1 AND user_id = $2 AND shift_id = $3
    `, [task_id, userId, shiftId]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already completed' });
    }

    // ✅ insert completion
    await query(`
      INSERT INTO task_completions (task_id, user_id, shift_id)
      VALUES ($1, $2, $3)
    `, [task_id, userId, shiftId]);

    res.json({ success: true });

  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// CREATE TASK
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, location_id } = req.body;

    const result = await query(`
      INSERT INTO tasks (title, description, location_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [title, description, location_id]);

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
// ✅ COMPLETE TASK
//
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { task_id } = req.body;

    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE user_id = $1 AND clock_out_time IS NULL
      LIMIT 1
    `, [userId]);

    if (shiftRes.rows.length === 0) {
      return res.status(400).json({ error: 'No active shift' });
    }

    const shiftId = shiftRes.rows[0].id;

    const existing = await query(`
      SELECT * FROM task_completions
      WHERE task_id = $1 AND user_id = $2 AND shift_id = $3
    `, [task_id, userId, shiftId]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already completed' });
    }

    await query(`
      INSERT INTO task_completions (task_id, user_id, shift_id)
      VALUES ($1, $2, $3)
    `, [task_id, userId, shiftId]);

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