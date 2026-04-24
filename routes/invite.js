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

      const cleanEmail = email.trim().toLowerCase();

      const companyId = req.user.companyId;

      const baseUrl = (
        process.env.FRONTEND_URL ||
        "https://app.zorviatech.co.uk"
      ).replace(/\/$/, "");

      /* 1. Send invite */
      const { data, error } =
        await supabase.auth.admin.inviteUserByEmail(
          cleanEmail,
          {
            redirectTo: `${baseUrl}/set-password`,
            data: {
              role: role || "employee",
              company_id: companyId,
            },
          }
        );

      if (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      const authUser = data.user;

      if (!authUser?.id) {
        return res.status(500).json({
          error: "Invite sent but no auth user created",
        });
      }

      /* 2. Create users table row NOW */
      const { error: insertError } =
        await supabase
          .from("users")
          .upsert({
            id: authUser.id,
            email: cleanEmail,
            name: cleanEmail.split("@")[0],
            role: role || "employee",
            company_id: companyId,
          });

      if (insertError) {
        return res.status(500).json({
          error: insertError.message,
        });
      }

      return res.json({
        success: true,
        message: "Invite sent successfully",
      });

    } catch (err) {
      return res.status(500).json({
        error: err.message || "Invite failed",
      });
    }
  }
);

module.exports = router;