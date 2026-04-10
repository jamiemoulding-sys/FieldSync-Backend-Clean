const express = require('express');
const router = express.Router();

const { authenticateToken, requireRole, requireCompany } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

// 🔥 SAFE INIT
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase ENV");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/',
  authenticateToken,
  requireCompany,
  requireRole('admin'),
  async (req, res) => {
    try {
      console.log("🔥 INVITE HIT");

      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      const baseUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, '');

      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${baseUrl}/set-password`,
          data: {
            role: role || 'employee',
            company_id: req.user.companyId
          }
        }
      );

      if (error) {
        console.error("❌ SUPABASE ERROR:", error);

        return res.status(500).json({
          error: error.message,
          details: error
        });
      }

      return res.json({
        message: "Invite sent",
        data
      });

    } catch (err) {
      console.error("💥 INVITE CRASH:", err);

      return res.status(500).json({
        error: err.message || "Invite failed",
        stack: err.stack
      });
    }
  }
);

module.exports = router;