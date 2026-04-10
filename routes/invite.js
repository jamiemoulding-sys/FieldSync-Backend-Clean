const express = require('express');
const router = express.Router();

const { authenticateToken, requireRole } = require('../middleware/auth');

const { createClient } = require('@supabase/supabase-js');

// 🔥 USE SERVICE ROLE KEY (CRITICAL)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

//
// =======================
// 📧 INVITE USER
// =======================
router.post('/',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      // 🔥 SEND SUPABASE INVITE
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${process.env.FRONTEND_URL}/set-password`,

          data: {
            role: role || 'employee',
            company_id: req.user.companyId
          }
        }
      );

      if (error) {
        console.error('❌ Supabase invite error:', error);
        return res.status(500).json({ error: error.message });
      }

      if (error) {
  console.error('❌ Supabase invite error:', error);

  return res.status(500).json({
    error: error.message,
    full: error // 🔥 ADD THIS
  });
}

      return res.json({
        message: 'Invite sent successfully',
        data
      });

    } catch (err) {
      console.error('❌ Invite route error:', err);
      res.status(500).json({ error: 'Invite failed' });
    }
  }
);

module.exports = router;