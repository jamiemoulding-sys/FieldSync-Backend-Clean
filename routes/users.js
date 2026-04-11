const express = require("express");
const router = express.Router();

const { query } = require("../database/connection");
const {
  authenticateToken,
  requireRole,
  requireCompany,
} = require("../middleware/auth");

/* ====================================
   👥 GET ALL USERS
==================================== */
router.get(
  "/",
  authenticateToken,
  requireCompany,
  async (req, res) => {
    try {
      const result = await query(
        `
        SELECT
          id,
          name,
          email,
          role,
          company_id,
          is_pro,
          phone,
          job_title
        FROM users
        WHERE company_id = $1
        ORDER BY name ASC
        `,
        [req.user.companyId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("GET USERS ERROR:", error);
      res.status(500).json({
        error: "Failed to fetch users",
      });
    }
  }
);

/* ====================================
   🔁 UPDATE ROLE
==================================== */
router.put(
  "/:id/role",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { role } = req.body;

      await query(
        `
        UPDATE users
        SET role = $1
        WHERE id = $2
        `,
        [role, req.params.id]
      );

      res.json({
        success: true,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to update role",
      });
    }
  }
);

/* ====================================
   ❌ DELETE USER
==================================== */
router.delete(
  "/:id",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    try {
      await query(
        `
        DELETE FROM users
        WHERE id = $1
        `,
        [req.params.id]
      );

      res.json({
        success: true,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete user",
      });
    }
  }
);

module.exports = router;