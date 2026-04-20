const express = require("express");
const router = express.Router();

const {
  authenticateToken,
  requireRole,
  requireCompany,
} = require("../middleware/auth");

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post(
  "/",
  authenticateToken,
  requireCompany,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({
          error: "Email required",
        });
      }

      const baseUrl = (
        process.env.FRONTEND_URL ||
        "https://app.zorviatech.co.uk"
      ).replace(/\/$/, "");

      const { data, error } =
        await supabase.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo: `${baseUrl}/set-password`,
            data: {
              role: role || "employee",
              company_id: req.user.companyId,
            },
          }
        );

      if (error) {
        console.error("SUPABASE INVITE ERROR:", error);
        return res.status(400).json({
          error: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Invite sent successfully",
        data,
      });
    } catch (err) {
      console.error("INVITE CRASH:", err);

      return res.status(500).json({
        error: err.message || "Invite failed",
      });
    }
  }
);

module.exports = router;