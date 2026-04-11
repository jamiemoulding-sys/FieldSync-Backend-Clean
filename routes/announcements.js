const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const { authenticateToken } = require("../middleware/auth");

//
// GET ACTIVE ANNOUNCEMENTS
//
router.get("/", authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const result = await query(`
      SELECT *
      FROM announcements
      WHERE company_id = $1
      AND (
        expires_at IS NULL
        OR expires_at > NOW()
      )
      ORDER BY created_at DESC
      LIMIT 5
    `, [companyId]);

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

//
// CREATE MESSAGE
//
router.post("/", authenticateToken, async (req, res) => {
  try {
    if (
      req.user.role !== "admin" &&
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    const {
      title,
      message,
      priority,
      expiresAt
    } = req.body;

    const result = await query(`
      INSERT INTO announcements
      (
        company_id,
        title,
        message,
        priority,
        created_by,
        expires_at
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [
      req.user.companyId,
      title,
      message,
      priority || "normal",
      req.user.id,
      expiresAt || null
    ]);

    res.json(result.rows[0]);

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

//
// DELETE
//
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    if (
      req.user.role !== "admin" &&
      req.user.role !== "manager"
    ) {
      return res.status(403).json({
        error: "Forbidden"
      });
    }

    await query(`
      DELETE FROM announcements
      WHERE id = $1
      AND company_id = $2
    `, [
      req.params.id,
      req.user.companyId
    ]);

    res.json({
      success: true
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;