const express = require("express");
const router = express.Router();
const Stripe = require("stripe");

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY
);

const {
  authenticateToken,
} = require("../middleware/auth");

const { query } = require(
  "../database/connection"
);

/* =========================
   CREATE CHECKOUT SESSION
========================= */
router.post(
  "/create-checkout-session",
  authenticateToken,
  async (req, res) => {
    try {
      const userId =
        req.user.id;

      /* get user/company */
      const result =
        await query(
          `
          SELECT id, email, company_id
          FROM users
          WHERE id = $1
          `,
          [userId]
        );

      const user =
        result.rows[0];

      if (!user) {
        return res
          .status(404)
          .json({
            error:
              "User not found",
          });
      }

      const frontend =
        process.env
          .FRONTEND_URL ||
        "https://fieldsync.app";

      const session =
        await stripe.checkout.sessions.create(
          {
            payment_method_types:
              ["card"],

            mode:
              "subscription",

            customer_email:
              user.email,

            metadata: {
              userId:
                String(
                  user.id
                ),
              companyId:
                String(
                  user.company_id ||
                    ""
                ),
            },

            line_items: [
              {
                price_data: {
                  currency:
                    "gbp",

                  product_data:
                    {
                      name:
                        "FieldSync Pro",
                      description:
                        "Unlimited staff, reports, analytics & advanced tools",
                    },

                  unit_amount: 600,

                  recurring:
                    {
                      interval:
                        "month",
                    },
                },

                quantity: 1,
              },
            ],

            success_url: `${frontend}/success?session_id={CHECKOUT_SESSION_ID}`,

            cancel_url: `${frontend}/upgrade`,
          }
        );

      res.json({
        url: session.url,
      });

    } catch (err) {
      console.error(
        "STRIPE ERROR:",
        err
      );

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

module.exports = router;