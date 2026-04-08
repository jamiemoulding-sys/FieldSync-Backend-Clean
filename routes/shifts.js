const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { getDistanceInMeters } = require('../utils/distance');

//
// =======================
// ✅ CLOCK IN (COMPANY SAFE 🔥)
// =======================
//
router.post('/clock-in', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const { location_id, latitude, longitude } = req.body;

    if (!companyId) {
      return res.status(403).json({ error: "No company assigned" });
    }

    // 🔹 Get location (scoped)
    const locationRes = await query(
      'SELECT * FROM locations WHERE id = $1 AND company_id = $2',
      [location_id, companyId]
    );

    const location = locationRes.rows[0];

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // 🔹 Distance check
    const distance = getDistanceInMeters(
      latitude,
      longitude,
      location.latitude,
      location.longitude
    );

    if (distance > (location.radius || 100)) {
      return res.status(403).json({
        error: `Outside allowed location (${Math.round(distance)}m away)`
      });
    }

    // 🔹 Prevent duplicate shift
    const existing = await query(`
      SELECT * FROM shifts
      WHERE user_id = $1 
      AND company_id = $2
      AND clock_out_time IS NULL
    `, [userId, companyId]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in' });
    }

    // 🔥 Check schedule (scoped)
    const today = new Date().toISOString().split('T')[0];

    const scheduleRes = await query(`
      SELECT * FROM schedules
      WHERE user_id = $1 
      AND company_id = $2
      AND date = $3
      LIMIT 1
    `, [userId, companyId, today]);

    const schedule = scheduleRes.rows[0];
    const now = new Date();

    let isLate = false;

    if (schedule && new Date(schedule.start_time) < now) {
      isLate = true;
    }

    // 🔹 Create shift (WITH company_id 🔥)
    const result = await query(`
      INSERT INTO shifts (user_id, location_id, latitude, longitude, clock_in_time, is_late, company_id)
      VALUES ($1, $2, $3, $4, NOW(), $5, $6)
      RETURNING *
    `, [userId, location_id, latitude, longitude, isLate, companyId]);

    res.json({
      message: isLate ? 'Clocked in (late)' : 'Clocked in!',
      shift: result.rows[0],
      isLate
    });

  } catch (error) {
    console.error('CLOCK IN ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// ✅ CLOCK OUT (SAFE)
// =======================
//
router.post('/clock-out', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    const result = await query(`
      UPDATE shifts
      SET clock_out_time = NOW()
      WHERE user_id = $1 
      AND company_id = $2
      AND clock_out_time IS NULL
      RETURNING *
    `, [userId, companyId]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No active shift found' });
    }

    res.json({ success: true, shift: result.rows[0] });

  } catch (err) {
    console.error('CLOCK OUT ERROR:', err);
    res.status(500).json({ error: 'Clock out failed' });
  }
});

//
// =======================
// 👤 ACTIVE SHIFT
// =======================
//
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM shifts
      WHERE user_id = $1 
      AND company_id = $2
      AND clock_out_time IS NULL
      ORDER BY clock_in_time DESC
      LIMIT 1
    `, [req.user.id, req.user.companyId]);

    res.json(result.rows[0] || null);

  } catch (error) {
    console.error('ACTIVE ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 👥 ACTIVE SHIFTS (COMPANY ONLY 🔥)
// =======================
//
router.get('/active-all', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT s.*, u.name
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      WHERE s.company_id = $1
      AND s.clock_out_time IS NULL
      ORDER BY s.clock_in_time DESC
    `, [req.user.companyId]);

    res.json(result.rows);

  } catch (error) {
    console.error('ACTIVE ALL ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 📜 HISTORY (SAFE)
// =======================
//
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT *
      FROM shifts
      WHERE user_id = $1 
      AND company_id = $2
      ORDER BY clock_in_time DESC
      LIMIT 20
    `, [req.user.id, req.user.companyId]);

    res.json(result.rows);

  } catch (error) {
    console.error('HISTORY ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 📍 UPDATE LOCATION (SAFE)
// =======================
//
router.post('/update-location', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    await query(`
      UPDATE shifts
      SET latitude = $1, longitude = $2
      WHERE user_id = $3 
      AND company_id = $4
      AND clock_out_time IS NULL
    `, [latitude, longitude, req.user.id, req.user.companyId]);

    res.json({ success: true });

  } catch (error) {
    console.error('LOCATION UPDATE ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 📊 ANALYTICS (SAFE 🔥)
// =======================
//
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        DATE(clock_in_time) as date,
        SUM(
          EXTRACT(EPOCH FROM (COALESCE(clock_out_time, NOW()) - clock_in_time)) / 3600
        ) as hours
      FROM shifts
      WHERE company_id = $1
      AND clock_in_time >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(clock_in_time)
      ORDER BY DATE(clock_in_time)
    `, [req.user.companyId]);

    res.json(result.rows);

  } catch (error) {
    console.error('ANALYTICS ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 🚨 PATTERNS (SAFE 🔥)
// =======================
//
router.get('/patterns', authenticateToken, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        user_id,
        COUNT(*) FILTER (WHERE is_late = true) as late_count,
        COUNT(*) as total_shifts
      FROM shifts
      WHERE company_id = $1
      GROUP BY user_id
    `, [req.user.companyId]);

    res.json(result.rows);

  } catch (error) {
    console.error('PATTERNS ERROR:', error);
    res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

module.exports = router;