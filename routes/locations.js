const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');

const {
  authenticateToken,
  requireCompany,
  requireRole
} = require('../middleware/auth');

//
// =======================
// 📍 GET ALL
// =======================
router.get('/',
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(
        `SELECT *
         FROM locations
         WHERE company_id = $1
         ORDER BY id DESC`,
        [req.user.companyId]
      );

      res.json(result.rows);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  }
);

//
// =======================
// ➕ CREATE (MANAGER+)
// =======================
router.post('/',
  authenticateToken,
  requireCompany,
  requireRole('manager', 'admin'),
  async (req, res) => {
    try {
      const { name, address, latitude, longitude, radius } = req.body;

      if (!name || latitude == null || longitude == null) {
        return res.status(400).json({
          error: 'Name, latitude and longitude are required'
        });
      }

      const result = await query(
        `INSERT INTO locations 
         (name, address, latitude, longitude, radius, company_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          name,
          address || '',
          latitude,
          longitude,
          radius || 100,
          req.user.companyId
        ]
      );

      // 🧠 ACTIVITY LOG
      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Created location ${name}`
        ]
      );

      res.json(result.rows[0]);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Create failed' });
    }
  }
);

//
// =======================
// ✏️ UPDATE (MANAGER+)
// =======================
router.put('/:id',
  authenticateToken,
  requireCompany,
  requireRole('manager', 'admin'),
  async (req, res) => {
    try {
      const { name, address, latitude, longitude, radius } = req.body;

      const result = await query(
        `UPDATE locations
         SET name=$1,
             address=$2,
             latitude=$3,
             longitude=$4,
             radius=$5
         WHERE id=$6 AND company_id=$7
         RETURNING *`,
        [
          name,
          address || '',
          latitude,
          longitude,
          radius || 100,
          req.params.id,
          req.user.companyId
        ]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Location not found'
        });
      }

      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Updated location ${req.params.id}`
        ]
      );

      res.json(result.rows[0]);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Update failed' });
    }
  }
);

//
// =======================
// ❌ DELETE (ADMIN ONLY)
// =======================
router.delete('/:id',
  authenticateToken,
  requireCompany,
  requireRole('admin'),
  async (req, res) => {
    try {
      const result = await query(
        `DELETE FROM locations
         WHERE id=$1 AND company_id=$2
         RETURNING id`,
        [req.params.id, req.user.companyId]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Location not found'
        });
      }

      await query(
        `INSERT INTO activity_logs (company_id, user_id, action)
         VALUES ($1, $2, $3)`,
        [
          req.user.companyId,
          req.user.id,
          `Deleted location ${req.params.id}`
        ]
      );

      res.json({ success: true });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Delete failed' });
    }
  }
);

module.exports = router;