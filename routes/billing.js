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
   PRICE IDS
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
    basePrice:
      PRICES.starter,
    extraPrice:
      PRICES.extraStarter,
  },

  pro: {
    included: 10,
    basePrice:
      PRICES.pro,
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
   CHECK STRIPE CONFIG
========================================== */

function validateStripeConfig() {
  if (
    !process.env
      .STRIPE_SECRET_KEY
  ) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY"
    );
  }
}

/* ==========================================
   CREATE / FIND CUSTOMER
========================================== */

async function getOrCreateCustomer(
  user
) {
  if (
    user.stripe_customer_id
  ) {
    return user.stripe_customer_id;
  }

  const customer =
    await stripe.customers.create(
      {
        email: user.email,
        name:
          user.company_name ||
          user.name ||
          "Customer",

        metadata: {
          companyId: String(
            user.company_id
          ),
          userId: String(
            user.id
          ),
        },
      }
    );

  await query(
    `
    UPDATE companies
    SET stripe_customer_id = $1
    WHERE id = $2
    `,
    [
      customer.id,
      user.company_id,
    ]
  );

  return customer.id;
}

/* ==========================================
   CREATE CHECKOUT SESSION
========================================== */

router.post(
  "/create-checkout-session",
  authenticateToken,
  async (req, res) => {
    try {
      validateStripeConfig();

      const plan =
        req.body?.plan ||
        "pro";

      if (
        !PLAN_RULES[plan]
      ) {
        return res
          .status(400)
          .json({
            error:
              "Invalid plan",
          });
      }

      const userRes =
        await query(
          `
          SELECT
            u.id,
            u.email,
            u.name,
            u.company_id,
            c.name AS company_name,
            c.stripe_customer_id
          FROM users u
          LEFT JOIN companies c
            ON c.id = u.company_id
          WHERE u.id = $1
          LIMIT 1
          `,
          [req.user.id]
        );

      const user =
        userRes.rows[0];

      if (!user) {
        return res
          .status(404)
          .json({
            error:
              "User not found",
          });
      }

      if (
        !user.company_id
      ) {
        return res
          .status(400)
          .json({
            error:
              "No company linked",
          });
      }

      const staffRes =
        await query(
          `
          SELECT COUNT(*) AS total
          FROM users
          WHERE company_id = $1
          `,
          [
            user.company_id,
          ]
        );

      const staffCount =
        Number(
          staffRes.rows[0]
            ?.total
        ) || 1;

      const rules =
        PLAN_RULES[plan];

      const extraStaff =
        Math.max(
          0,
          staffCount -
            rules.included
        );

      const lineItems =
        [
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

      const customerId =
        await getOrCreateCustomer(
          user
        );

      const frontend =
        process.env
          .FRONTEND_URL ||
        "https://app.zorviatech.co.uk";

      const session =
        await stripe.checkout.sessions.create(
          {
            mode:
              "subscription",

            customer:
              customerId,

            payment_method_types:
              ["card"],

            line_items:
              lineItems,

            subscription_data:
              {
                trial_period_days: 14,
              },

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

            success_url: `${frontend}/success?session_id={CHECKOUT_SESSION_ID}`,

            cancel_url: `${frontend}/billing`,
          }
        );

      return res.json({
        url: session.url,
      });
    } catch (err) {
      console.error(
        "CHECKOUT ERROR:"
      );
      console.error(err);

      return res
        .status(500)
        .json({
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
      validateStripeConfig();

      const result =
        await query(
          `
          SELECT
            c.id,
            c.name,
            c.stripe_customer_id,
            u.email
          FROM companies c
          LEFT JOIN users u
            ON u.company_id = c.id
          WHERE c.id = $1
          LIMIT 1
          `,
          [
            req.user
              .companyId,
          ]
        );

      const company =
        result.rows[0];

      if (!company) {
        return res
          .status(404)
          .json({
            error:
              "Company not found",
          });
      }

      let customerId =
        company.stripe_customer_id;

      /* AUTO CREATE CUSTOMER IF MISSING */
      if (!customerId) {
        const customer =
          await stripe.customers.create(
            {
              email:
                company.email,
              name:
                company.name,
              metadata: {
                companyId:
                  String(
                    company.id
                  ),
              },
            }
          );

        customerId =
          customer.id;

        await query(
          `
          UPDATE companies
          SET stripe_customer_id = $1
          WHERE id = $2
          `,
          [
            customerId,
            company.id,
          ]
        );
      }

      const portal =
        await stripe.billingPortal.sessions.create(
          {
            customer:
              customerId,

            return_url:
              process.env
                .FRONTEND_URL ||
              "https://app.zorviatech.co.uk/billing",
          }
        );

      return res.json({
        url: portal.url,
      });
    } catch (err) {
      console.error(
        "PORTAL ERROR:"
      );
      console.error(err);

      return res
        .status(500)
        .json({
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
            subscription_status = 'trialing',
            current_plan = $3,
            is_pro = true,
            trial_ends_at = NOW() + INTERVAL '14 days'
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

      if (
        event.type ===
        "customer.subscription.updated"
      ) {
        const sub =
          event.data.object;

        await query(
          `
          UPDATE companies
          SET subscription_status = $1
          WHERE stripe_subscription_id = $2
          `,
          [
            sub.status,
            sub.id,
          ]
        );
      }

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
            is_pro = false,
            current_plan = 'free'
          WHERE stripe_subscription_id = $1
          `,
          [sub.id]
        );
      }

      return res.json({
        received: true,
      });
    } catch (err) {
      console.error(
        "WEBHOOK ERROR:"
      );
      console.error(err);

      return res
        .status(400)
        .send(
          `Webhook Error: ${err.message}`
        );
    }
  }
);

module.exports = router;