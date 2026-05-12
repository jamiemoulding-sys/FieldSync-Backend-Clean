const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { getDistanceInMeters } = require('../utils/distance');
const { 
  clockInRequestSchema,
  clockOutRequestSchema,
  breakStartRequestSchema,
  breakEndRequestSchema
} = require('@fieldsync/shared');

function pickClockInPayload(body) {
  const keys = ['location_id', 'latitude', 'longitude', 'shift_type', 'verified'];
  const picked = {};
  for (const k of keys) {
    if (body[k] !== undefined) picked[k] = body[k];
  }
  return picked;
}

function clockInValidationFailed(res, zodError) {
  return res.status(400).json({
    error: 'Validation failed',
    issues: zodError.issues
  });
}

function clockOutValidationFailed(res, zodError) {
  return res.status(400).json({
    error: 'Validation failed',
    issues: zodError.issues
  });
}

function breakValidationFailed(res, zodError) {
  return res.status(400).json({
    error: 'Validation failed',
    issues: zodError.issues
  });
}

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
// ✅ CLOCK IN
// =======================
router.post('/clock-in', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(403).json({ error: "No company assigned" });
    }

    const parsed = clockInRequestSchema.safeParse(
      pickClockInPayload(req.body)
    );

    if (!parsed.success) {
      return clockInValidationFailed(res, parsed.error);
    }

    const { location_id, latitude, longitude } = parsed.data;

    // 🔹 Validate location
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
      SELECT id FROM shifts
      WHERE user_id = $1
      AND company_id = $2
      AND clock_out_time IS NULL
    `, [userId, companyId]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in' });
    }

    // 🔹 Check schedule
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

    const isLate = schedule && new Date(schedule.start_time) < now;

    // 🔹 Insert shift
    const result = await query(`
      INSERT INTO shifts (
        user_id,
        location_id,
        latitude,
        longitude,
        clock_in_time,
        is_late,
        company_id
      )
      VALUES ($1, $2, $3, $4, NOW(), $5, $6)
      RETURNING *
    `, [userId, location_id, latitude, longitude, isLate, companyId]);

    // 🔥 LOG ACTIVITY
    await logActivity(userId, companyId, 'clock_in', {
      isLate,
      location_id
    });

    return res.json({
      message: isLate ? 'Clocked in (late)' : 'Clocked in',
      shift: result.rows[0],
      isLate
    });

  } catch (error) {
    console.error('CLOCK IN ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// ✅ CLOCK OUT
// =======================
router.post('/clock-out', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    // Validate optional GPS coordinates
    const parsed = clockOutRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return clockOutValidationFailed(res, parsed.error);
    }

    const { clock_out_lat, clock_out_lng } = parsed.data;

    // Build update query with optional GPS fields
    let updateQuery = `
      UPDATE shifts
      SET clock_out_time = NOW()
    `;
    
    const queryParams = [userId, companyId];
    let paramIndex = 3;

    // Add GPS coordinates if provided
    if (clock_out_lat !== undefined && clock_out_lng !== undefined) {
      updateQuery += `,
        clock_out_lat = $${paramIndex},
        clock_out_lng = $${paramIndex + 1}
      `;
      queryParams.push(clock_out_lat, clock_out_lng);
      paramIndex += 2;
    }

    updateQuery += `
      WHERE user_id = $1
      AND company_id = $2
      AND clock_out_time IS NULL
      RETURNING *
    `;

    const result = await query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No active shift found' });
    }

    // 🔥 LOG ACTIVITY
    await logActivity(userId, companyId, 'clock_out');

    return res.json({
      success: true,
      shift: result.rows[0]
    });

  } catch (err) {
    console.error('CLOCK OUT ERROR:', err);
    return res.status(500).json({
      error: 'Clock out failed'
    });
  }
});

//
// =======================
// ⏸️ START BREAK
// =======================
router.post('/break/start', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    const parsed = breakStartRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return breakValidationFailed(res, parsed.error);
    }

    const { shift_id, reason, location } = parsed.data;

    // 🔹 Validate active shift
    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE id = $1
      AND user_id = $2
      AND company_id = $3
      AND clock_out_time IS NULL
    `, [shift_id, userId, companyId]);

    const activeShift = shiftRes.rows[0];
    if (!activeShift) {
      return res.status(404).json({ error: 'Active shift not found' });
    }

    // 🔹 Prevent duplicate breaks
    if (activeShift.break_started_at) {
      return res.status(403).json({ error: 'Break already in progress' });
    }

    // 🔹 Start break
    const result = await query(`
      UPDATE shifts
      SET break_started_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [shift_id]);

    // 🔥 LOG ACTIVITY
    await logActivity(userId, companyId, 'break_start', {
      shift_id,
    });

    return res.status(201).json({
      success: true,
      break: {
        id: result.rows[0].id,
        shift_id: result.rows[0].id,
        break_started_at: result.rows[0].break_started_at,
      }
    });

  } catch (error) {
    console.error('BREAK START ERROR:', error);
    return res.status(500).json({
      error: 'Break start failed'
    });
  }
});

//
// =======================
// ▶️ END BREAK
// =======================
router.post('/break/end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;

    const parsed = breakEndRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return breakValidationFailed(res, parsed.error);
    }

    const { shift_id } = parsed.data;

    // 🔹 Validate active shift
    const shiftRes = await query(`
      SELECT * FROM shifts
      WHERE id = $1
      AND user_id = $2
      AND company_id = $3
      AND clock_out_time IS NULL
    `, [shift_id, userId, companyId]);

    const activeShift = shiftRes.rows[0];
    if (!activeShift) {
      return res.status(404).json({ error: 'Active shift not found' });
    }

    // 🔹 Validate active break
    if (!activeShift.break_started_at) {
      return res.status(404).json({ error: 'No active break found' });
    }

    // 🔹 Calculate break duration
    const breakDuration = await query(`
      SELECT EXTRACT(EPOCH FROM (NOW() - break_started_at)) as seconds
      FROM shifts
      WHERE id = $1
    `, [shift_id]);

    const breakSeconds = Math.floor(breakDuration.rows[0].seconds);
    const totalBreakSeconds = (activeShift.total_break_seconds || 0) + breakSeconds;

    // 🔹 End break
    const result = await query(`
      UPDATE shifts
      SET 
        break_started_at = NULL,
        total_break_seconds = $1
      WHERE id = $2
      RETURNING *
    `, [totalBreakSeconds, shift_id]);

    // 🔥 LOG ACTIVITY
    await logActivity(userId, companyId, 'break_end', {
      shift_id,
      break_duration_seconds: breakSeconds,
      total_break_seconds: totalBreakSeconds
    });

    return res.json({
      success: true,
      break: {
        id: result.rows[0].id,
        shift_id: result.rows[0].id,
        break_started_at: result.rows[0].break_started_at,
        total_break_seconds: totalBreakSeconds
      }
    });

  } catch (error) {
    console.error('BREAK END ERROR:', error);
    return res.status(500).json({
      error: 'Break end failed'
    });
  }
});

//
// =======================
// 👤 ACTIVE SHIFT
// =======================
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

    return res.json(result.rows[0] || null);

  } catch (error) {
    console.error('ACTIVE ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 👥 ACTIVE SHIFTS
// =======================
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

    return res.json(result.rows);

  } catch (error) {
    console.error('ACTIVE ALL ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 📜 HISTORY
// =======================
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

    return res.json(result.rows);

  } catch (error) {
    console.error('HISTORY ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

//
// =======================
// 📊 ANALYTICS
// =======================
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

    return res.json(result.rows);

  } catch (error) {
    console.error('ANALYTICS ERROR:', error);
    return res.status(500).json({
      error: "REAL_ERROR",
      message: error.message
    });
  }
});

module.exports = router;