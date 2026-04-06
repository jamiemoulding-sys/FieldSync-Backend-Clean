const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// -------------------------
// DISTANCE CALC (Haversine)
// -------------------------
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// -------------------------
// CLOCK IN
// -------------------------
router.post('/clock-in', authenticateToken, [
  body('location_id').isInt(),
  body('gps_lat').isFloat(),
  body('gps_lng').isFloat(),
  body('gps_accuracy').optional().isFloat()
], async (req, res) => {
  try {
    const { location_id, gps_lat, gps_lng, gps_accuracy } = req.body;
    const userId = req.user.id;

    if (!gps_lat || !gps_lng) {
      return res.status(400).json({
        error: 'Location required to clock in'
      });
    }

    if (gps_accuracy && gps_accuracy > 100) {
      return res.status(400).json({
        error: `GPS accuracy too low (${Math.round(gps_accuracy)}m)`
      });
    }

    // check active shift
    const activeShift = await query(
      'SELECT * FROM shifts WHERE user_id = ? AND clock_out_time IS NULL',
      [userId]
    );

    if (activeShift.rows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in' });
    }

    // get location
    const location = await query(
      'SELECT * FROM locations WHERE id = ?',
      [location_id]
    );

    if (location.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const loc = location.rows[0];

    // distance calc
    const { calculateDistance } = require('../utils/geocoding');

    const distance = Math.round(
      calculateDistance(
        gps_lat,
        gps_lng,
        loc.latitude,
        loc.longitude
      )
    );

    // geofence check
    if (loc.geofence_enabled && distance > loc.geofence_radius) {
      return res.status(403).json({
        error: `Outside allowed area (${distance}m / ${loc.geofence_radius}m)`
      });
    }

    const result = await query(
      `INSERT INTO shifts 
      (user_id, location_id, clock_in_time, gps_lat, gps_lng, gps_accuracy, distance_from_location, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`,
      [
        userId,
        location_id,
        new Date().toISOString(),
        gps_lat,
        gps_lng,
        gps_accuracy || null,
        distance,
        req.ip
      ]
    );

    res.json({ shift: result.rows[0] });

  } catch (err) {
    console.error(err);
   res.status(500).json({
  error: "REAL_ERROR",
  message: err.message
});
  }
});

// -------------------------
// CLOCK OUT
// -------------------------
router.post('/clock-out', authenticateToken, [
  body('gps_lat').isFloat(),
  body('gps_lng').isFloat(),
  body('gps_accuracy').optional().isFloat()
], async (req, res) => {
  try {
    const { gps_lat, gps_lng, gps_accuracy } = req.body;
    const userId = req.user.id;

    if (!gps_lat || !gps_lng) {
      return res.status(400).json({
        error: 'Location required to clock out'
      });
    }

    const activeShift = await query(
      'SELECT * FROM shifts WHERE user_id = ? AND clock_out_time IS NULL',
      [userId]
    );

    if (activeShift.rows.length === 0) {
      return res.status(400).json({ error: 'No active shift' });
    }

    await query(
      `UPDATE shifts 
       SET clock_out_time = ?, gps_lat = ?, gps_lng = ?, gps_accuracy = ?, ip_address = ?
       WHERE id = ?`,
      [
        new Date().toISOString(),
        gps_lat,
        gps_lng,
        gps_accuracy || null,
        req.ip,
        activeShift.rows[0].id
      ]
    );

    res.json({ message: 'Clocked out' });

  } catch (err) {
    console.error(err);
   res.status(500).json({
  error: "REAL_ERROR",
  message: err.message
});
  }
});

// -------------------------
// GET SESSIONS
// -------------------------
router.get('/sessions', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const db = getDatabase();

    db.all(
      'SELECT * FROM work_sessions WHERE user_id = ? ORDER BY clock_in_time DESC LIMIT ? OFFSET ?',
      [userId, limit, offset],
      (err, sessions) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json(sessions);
      }
    );
  } catch {
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// -------------------------
// ACTIVE SESSION
// -------------------------
router.get('/active-session', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const db = getDatabase();

    db.get(
      'SELECT * FROM work_sessions WHERE user_id = ? AND status = ?',
      [userId, 'active'],
      (err, session) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json(session || null);
      }
    );
  } catch {
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

module.exports = router;