console.log("🔥 AUTH ROUTES LOADED");

const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { query } = require("../database/connection");
const {
  authenticateToken,
} = require("../middleware/auth");

/* =====================================
   TOKEN BUILDER
===================================== */
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,

      companyId:
        user.company_id || null,

      role:
        user.role ||
        "employee",

      isPro:
        user.is_pro || false,

      is_pro:
        user.is_pro || false,

      current_plan:
        user.current_plan ||
        "free",

      subscription_status:
        user.subscription_status ||
        "free",

      name:
        user.name || "",

      phone:
        user.phone || "",

      companyName:
        user.company_name ||
        "",

      jobTitle:
        user.job_title ||
        "",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

/* =====================================
   LOGIN
===================================== */
router.post(
  "/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (
        !email ||
        !password
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing email or password",
          });
      }

      const result =
        await query(
          `
          SELECT
            u.id,
            u.email,
            u.password,
            u.name,
            u.phone,
            u.role,
            u.company_id,
            u.job_title,
            u.last_sign_in,

            COALESCE(c.name,'') AS company_name,
            COALESCE(c.is_pro,false) AS is_pro,
            COALESCE(c.current_plan,'free') AS current_plan,
            COALESCE(c.subscription_status,'free') AS subscription_status

          FROM users u
          LEFT JOIN companies c
          ON c.id = u.company_id

          WHERE LOWER(u.email)=LOWER($1)
          LIMIT 1
          `,
          [email]
        );

      const user =
        result.rows[0];

      if (!user) {
        return res
          .status(401)
          .json({
            error:
              "Invalid credentials",
          });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!valid) {
        return res
          .status(401)
          .json({
            error:
              "Invalid credentials",
          });
      }

      /* UPDATE LAST SIGN IN */
      await query(
        `
        UPDATE users
        SET last_sign_in = NOW()
        WHERE id = $1
        `,
        [user.id]
      );

      user.last_sign_in =
        new Date();

      const token =
        createToken(user);

      res.json({
        token,
        user: {
          id: user.id,
          email:
            user.email,

          name:
            user.name || "",

          phone:
            user.phone || "",

          role:
            user.role ||
            "employee",

          companyId:
            user.company_id,

          companyName:
            user.company_name,

          jobTitle:
            user.job_title ||
            "",

          isPro:
            user.is_pro,

          is_pro:
            user.is_pro,

          current_plan:
            user.current_plan,

          subscription_status:
            user.subscription_status,

          last_sign_in:
            user.last_sign_in,
        },
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/* =====================================
   REGISTER
===================================== */
router.post(
  "/register",
  async (req, res) => {
    try {
      const {
        email,
        password,
        name,
        companyName,
      } = req.body;

      if (
        !email ||
        !password
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing fields",
          });
      }

      const exists =
        await query(
          `
          SELECT id
          FROM users
          WHERE LOWER(email)=LOWER($1)
          `,
          [email]
        );

      if (
        exists.rows.length
      ) {
        return res
          .status(400)
          .json({
            error:
              "Email already exists",
          });
      }

      const hashed =
        await bcrypt.hash(
          password,
          10
        );

      const companyRes =
        await query(
          `
          INSERT INTO companies
          (
            name,
            is_pro,
            current_plan,
            subscription_status
          )
          VALUES
          (
            $1,
            false,
            'free',
            'free'
          )
          RETURNING *
          `,
          [
            companyName ||
              "My Company",
          ]
        );

      const company =
        companyRes.rows[0];

      const userRes =
        await query(
          `
          INSERT INTO users
          (
            email,
            password,
            name,
            phone,
            company_id,
            role,
            last_sign_in
          )
          VALUES
          (
            $1,$2,$3,'',$4,'admin',NOW()
          )
          RETURNING *
          `,
          [
            email,
            hashed,
            name ||
              "Owner",
            company.id,
          ]
        );

      const user =
        userRes.rows[0];

      user.company_name =
        company.name;

      user.is_pro = false;
      user.current_plan =
        "free";
      user.subscription_status =
        "free";

      const token =
        createToken(user);

      res.json({
        token,
        user: {
          id: user.id,
          email:
            user.email,

          name:
            user.name,

          phone:
            user.phone || "",

          role: "admin",

          companyId:
            company.id,

          companyName:
            company.name,

          isPro: false,
          is_pro: false,

          current_plan:
            "free",

          subscription_status:
            "free",

          last_sign_in:
            user.last_sign_in,
        },
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/* =====================================
   SET PASSWORD (INVITES)
===================================== */
router.post(
  "/set-password",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (
        !email ||
        !password
      ) {
        return res
          .status(400)
          .json({
            error:
              "Missing fields",
          });
      }

      const hashed =
        await bcrypt.hash(
          password,
          10
        );

      const result =
        await query(
          `
          UPDATE users
          SET password = $1
          WHERE LOWER(email)=LOWER($2)
          RETURNING id,email
          `,
          [
            hashed,
            email,
          ]
        );

      if (
        !result.rows.length
      ) {
        return res
          .status(404)
          .json({
            error:
              "User not found",
          });
      }

      res.json({
        success: true,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/* =====================================
   GET PROFILE
===================================== */
router.get(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            u.id,
            u.email,
            COALESCE(u.name,'') AS name,
            COALESCE(u.phone,'') AS phone,
            COALESCE(u.role,'employee') AS role,
            u.company_id,
            COALESCE(u.job_title,'') AS job_title,
            u.last_sign_in,

            COALESCE(c.name,'') AS company_name,
            COALESCE(c.is_pro,false) AS is_pro,
            COALESCE(c.current_plan,'free') AS current_plan,
            COALESCE(c.subscription_status,'free') AS subscription_status

          FROM users u
          LEFT JOIN companies c
          ON c.id = u.company_id

          WHERE u.id = $1
          LIMIT 1
          `,
          [req.user.id]
        );

      if (
        !result.rows.length
      ) {
        return res
          .status(404)
          .json({
            error:
              "User not found",
          });
      }

      const user =
        result.rows[0];

      res.json({
        ...user,
        isPro:
          user.is_pro,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

/* =====================================
   UPDATE PROFILE
===================================== */
router.put(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        name,
        phone,
        companyName,
        jobTitle,
      } = req.body;

      const updated =
        await query(
          `
          UPDATE users
          SET
            name = $1,
            phone = $2,
            job_title = $3
          WHERE id = $4
          RETURNING *
          `,
          [
            name || "",
            phone || "",
            jobTitle || "",
            req.user.id,
          ]
        );

      if (companyName) {
        await query(
          `
          UPDATE companies
          SET name = $1
          WHERE id = (
            SELECT company_id
            FROM users
            WHERE id = $2
          )
          `,
          [
            companyName,
            req.user.id,
          ]
        );
      }

      const user =
        updated.rows[0];

      res.json({
        id: user.id,
        email:
          user.email,
        name:
          user.name,
        phone:
          user.phone,
        role:
          user.role,
        companyName:
          companyName || "",
        jobTitle:
          user.job_title,
      });
    } catch (error) {
      res.status(500).json({
        error:
          error.message,
      });
    }
  }
);

module.exports = router;