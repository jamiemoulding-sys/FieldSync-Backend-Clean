const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const {
  authenticateToken,
} = require("../middleware/auth");

//
// =====================================
// 📢 FULL FIX ANNOUNCEMENTS ROUTES
// =====================================

// GET ALL ACTIVE
router.get(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const companyId =
        req.user.companyId;

      if (!companyId) {
        return res.status(403).json({
          error:
            "No company assigned",
        });
      }

      const result =
        await query(
          `
          SELECT
            id,
            title,
            message,
            priority,
            expires_at,
            created_at
          FROM announcements
          WHERE company_id = $1
          AND (
            expires_at IS NULL
            OR expires_at > NOW()
          )
          ORDER BY created_at DESC
          LIMIT 50
          `,
          [companyId]
        );

      return res.json(
        result.rows || []
      );
    } catch (error) {
      console.error(
        "ANNOUNCEMENTS GET ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to load announcements",
      });
    }
  }
);

// CREATE
router.post(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      if (
        req.user.role !==
          "admin" &&
        req.user.role !==
          "manager"
      ) {
        return res.status(403).json({
          error:
            "Forbidden",
        });
      }

      const {
        title,
        message,
        priority,
        expiresAt,
      } = req.body;

      if (
        !title ||
        !message
      ) {
        return res.status(400).json({
          error:
            "Title and message required",
        });
      }

      const result =
        await query(
          `
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
          `,
          [
            req.user.companyId,
            title,
            message,
            priority ||
              "normal",
            req.user.id,
            expiresAt ||
              null,
          ]
        );

      return res.json(
        result.rows[0]
      );
    } catch (error) {
      console.error(
        "ANNOUNCEMENTS CREATE ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to create announcement",
      });
    }
  }
);

// DELETE
router.delete(
  "/:id",
  authenticateToken,
  async (req, res) => {
    try {
      if (
        req.user.role !==
          "admin" &&
        req.user.role !==
          "manager"
      ) {
        return res.status(403).json({
          error:
            "Forbidden",
        });
      }

      await query(
        `
        DELETE FROM announcements
        WHERE id = $1
        AND company_id = $2
        `,
        [
          req.params.id,
          req.user.companyId,
        ]
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(
        "ANNOUNCEMENTS DELETE ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to delete announcement",
      });
    }
  }
);

module.exports = router;