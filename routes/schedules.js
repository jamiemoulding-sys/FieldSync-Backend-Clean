const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { query } = require('../database/connection');

// =======================
// 📅 GET ALL SCHEDULES
// =======================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT s.*, u.name
      FROM schedules s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.date DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET schedules error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// 👤 MY SCHEDULE
// =======================
router.get('/my-schedule', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM schedules
      WHERE user_id = $1
      ORDER BY date DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('MY schedule error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// ➕ CREATE SCHEDULE
// =======================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { user_id, date, start_time, end_time } = req.body;

    const result = await query(`
      INSERT INTO schedules (user_id, date, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [user_id, date, start_time, end_time]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('CREATE schedule error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// ✏️ UPDATE SCHEDULE
// =======================
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { start_time, end_time } = req.body;

    const result = await query(`
      UPDATE schedules
      SET start_time = $1,
          end_time = $2
      WHERE id = $3
      RETURNING *
    `, [start_time, end_time, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('UPDATE schedule error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// ❌ DELETE SCHEDULE
// =======================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await query(`
      DELETE FROM schedules
      WHERE id = $1
    `, [req.params.id]);

    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    console.error('DELETE schedule error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// 🚨 LATE ARRIVALS
// =======================
router.get('/late-arrivals', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.name, s.start_time, sh.clock_in_time
      FROM schedules s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN shifts sh ON sh.user_id = s.user_id
        AND DATE(sh.clock_in_time) = s.date
      WHERE sh.clock_in_time > s.start_time
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('LATE arrivals error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// 📅 HOLIDAY REQUESTS
// =======================

// create
router.post('/holiday-requests', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    const result = await query(`
      INSERT INTO holidays (user_id, start_date, end_date)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [req.user.id, start_date, end_date]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('CREATE holiday error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// get pending
router.get('/holiday-requests', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT h.*, u.name
      FROM holidays h
      JOIN users u ON u.id = h.user_id
      WHERE status = 'pending'
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET holidays error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// approve / reject
router.put('/holiday-requests/:id', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;

    const result = await query(`
      UPDATE holidays
      SET status = $1
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('UPDATE holiday error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// delete
router.delete('/holiday-requests/:id', authenticateToken, async (req, res) => {
  try {
    await query(`DELETE FROM holidays WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Holiday deleted' });
  } catch (error) {
    console.error('DELETE holiday error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// =======================
// 📊 TIMESHEET
// =======================
router.get('/timesheet', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM shifts
      WHERE user_id = $1
      ORDER BY clock_in_time DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('TIMESHEET error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

module.exports = router;