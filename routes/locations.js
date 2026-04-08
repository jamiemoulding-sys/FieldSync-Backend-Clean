const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');

// =======================
// 📍 GET ALL (SAFE)
// =======================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const result = await query(
      'SELECT * FROM locations WHERE company_id = $1 ORDER BY id DESC',
      [companyId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// =======================
// ➕ CREATE (SAFE)
// =======================
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, address, latitude, longitude, radius } = req.body;
    const companyId = req.user.companyId;

    const result = await query(`
      INSERT INTO locations (name, address, latitude, longitude, radius, company_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, address, latitude, longitude, radius || 100, companyId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Create failed' });
  }
});

// =======================
// ✏️ UPDATE (SAFE)
// =======================
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, address, latitude, longitude, radius } = req.body;

    const result = await query(`
      UPDATE locations
      SET name=$1, address=$2, latitude=$3, longitude=$4, radius=$5
      WHERE id=$6 AND company_id=$7
      RETURNING *
    `, [
      name,
      address,
      latitude,
      longitude,
      radius || 100,
      req.params.id,
      req.user.companyId
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// =======================
// ❌ DELETE (SAFE)
// =======================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await query(
      'DELETE FROM locations WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.companyId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;