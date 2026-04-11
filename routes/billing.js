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

/* ==========================================
   PRICE IDS (SET IN RENDER ENV)
========================================== */

const PRICES = {
  starter:
    process.env
      .STRIPE_STARTER_PRICE,

  pro:
    process.env
      .STRIPE_PRO_PRICE,

  business:
    process.env
      .STRIPE_BUSINESS_PRICE,

  extraStarter:
    process.env
      .STRIPE_EXTRA_STARTER_PRICE,

  extraPro:
    process.env
      .STRIPE_EXTRA_PRO_PRICE,

  extraBusiness:
    process.env
      .STRIPE_EXTRA_BUSINESS_PRICE,
};

/* ==========================================
   PLAN RULES
========================================== */

const PLAN_RULES = {
  starter: {
    included: 5,
    basePrice: PRICES.starter,
    extraPrice:
      PRICES.extraStarter,
  },

  pro: {
    included: 10,
    basePrice: PRICES.pro,
    extraPrice:
      PRICES.extraPro,
  },

  business: {
    included: 20,
    basePrice:
      PRICES.business,
    extraPrice:
      PRICES.extraBusiness,
  },
};

/* ==========================================
   CREATE CHECKOUT SESSION
========================================== */

router.post(
  "/create-checkout-session",
  authenticateToken,
  async (req, res) => {
    try {
      const { plan } = req.body;

      if (
        !plan ||
        !PLAN_RULES[plan]
      ) {
        return res.status(400).json({
          error:
            "Invalid plan",
        });
      }

      const userId =
        req.user.id;

      /* get user + company */
      const userRes =
        await query(
          `
          SELECT
            u.id,
            u.email,
            u.company_id,
            c.name
          FROM users u
          LEFT JOIN companies c
          ON c.id = u.company_id
          WHERE u.id = $1
          `,
          [userId]
        );

      const user =
        userRes.rows[0];

      if (!user) {
        return res.status(404).json({
          error:
            "User not found",
        });
      }

      if (
        !user.company_id
      ) {
        return res.status(400).json({
          error:
            "No company linked",
        });
      }

      /* count staff */
      const staffRes =
        await query(
          `
          SELECT COUNT(*) AS total
          FROM users
          WHERE company_id = $1
          `,
          [user.company_id]
        );

      const staffCount =
        Number(
          staffRes.rows[0]
            .total
        ) || 1;

      const rules =
        PLAN_RULES[plan];

      const extraStaff =
        Math.max(
          0,
          staffCount -
            rules.included
        );

      const frontend =
        process.env
          .FRONTEND_URL ||
        "https://app.zorviatech.co.uk";

      const lineItems = [
        {
          price:
            rules.basePrice,
          quantity: 1,
        },
      ];

      if (extraStaff > 0) {
        lineItems.push({
          price:
            rules.extraPrice,
          quantity:
            extraStaff,
        });
      }

      const session =
        await stripe.checkout.sessions.create(
          {
            mode:
              "subscription",

            payment_method_types:
              ["card"],

            customer_email:
              user.email,

            line_items:
              lineItems,

            metadata: {
              userId:
                String(
                  user.id
                ),
              companyId:
                String(
                  user.company_id
                ),
              plan,
              staffCount:
                String(
                  staffCount
                ),
            },

            success_url: `${frontend}/billing-success?session_id={CHECKOUT_SESSION_ID}`,

            cancel_url: `${frontend}/upgrade`,
          }
        );

      res.json({
        url: session.url,
      });
    } catch (err) {
      console.error(
        "CHECKOUT ERROR:",
        err
      );

      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

/* ==========================================
   CUSTOMER PORTAL
========================================== */

router.post(
  "/portal",
  authenticateToken,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT stripe_customer_id
          FROM companies
          WHERE id = $1
          `,
          [
            req.user
              .companyId,
          ]
        );

      const customerId =
        result.rows[0]
          ?.stripe_customer_id;

      if (
        !customerId
      ) {
        return res.status(400).json({
          error:
            "No Stripe customer found",
        });
      }

      const portal =
        await stripe.billingPortal.sessions.create(
          {
            customer:
              customerId,
            return_url:
              process.env
                .FRONTEND_URL,
          }
        );

      res.json({
        url: portal.url,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err.message,
      });
    }
  }
);

/* ==========================================
   WEBHOOK
========================================== */

router.post(
  "/webhook",
  express.raw({
    type:
      "application/json",
  }),
  async (req, res) => {
    try {
      const sig =
        req.headers[
          "stripe-signature"
        ];

      const event =
        stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env
            .STRIPE_WEBHOOK_SECRET
        );

      /* checkout complete */
      if (
        event.type ===
        "checkout.session.completed"
      ) {
        const session =
          event.data.object;

        await query(
          `
          UPDATE companies
          SET
            stripe_customer_id = $1,
            stripe_subscription_id = $2,
            subscription_status = 'active',
            current_plan = $3,
            is_pro = true
          WHERE id = $4
          `,
          [
            session.customer,
            session.subscription,
            session.metadata
              .plan,
            session.metadata
              .companyId,
          ]
        );
      }

      /* cancelled */
      if (
        event.type ===
        "customer.subscription.deleted"
      ) {
        const sub =
          event.data.object;

        await query(
          `
          UPDATE companies
          SET
            subscription_status = 'cancelled',
            is_pro = false
          WHERE stripe_subscription_id = $1
          `,
          [sub.id]
        );
      }

      res.json({
        received: true,
      });
    } catch (err) {
      console.error(
        "WEBHOOK ERROR:",
        err.message
      );

      res.status(400).send(
        `Webhook Error: ${err.message}`
      );
    }
  }
);

module.exports = router;