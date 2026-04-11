console.log("🔥 AUTH ROUTES LOADED");

const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../database/connection");
const { authenticateToken } = require("../middleware/auth");

/* =======================
   TOKEN BUILDER
======================= */
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      companyId: user.company_id || null,
      role: user.role || "employee",
      isPro: user.is_pro || false,
      name: user.name || "",
      phone: user.phone || "",
      companyName: user.company_name || "",
      jobTitle: user.job_title || "",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/* =======================
   LOGIN
======================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Missing email or password",
      });
    }

    const result = await query(
      `
      SELECT
        u.id,
        u.email,
        u.password,
        u.name,
        u.phone,
        u.role,
        u.company_id,
        u.is_pro,
        u.job_title,
        c.name AS company_name
      FROM users u
      LEFT JOIN companies c
      ON c.id = u.company_id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1
      `,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || "",
        phone: user.phone || "",
        role: user.role || "employee",
        companyId: user.company_id,
        companyName: user.company_name || "",
        jobTitle: user.job_title || "",
        isPro: user.is_pro || false,
      },
    });
  } catch (error) {
    console.error("💥 LOGIN ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* =======================
   REGISTER
======================= */
router.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      companyName,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Missing fields",
      });
    }

    const exists = await query(
      `SELECT id FROM users WHERE LOWER(email)=LOWER($1)`,
      [email]
    );

    if (exists.rows.length) {
      return res.status(400).json({
        error: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const companyResult = await query(
      `
      INSERT INTO companies (name)
      VALUES ($1)
      RETURNING id, name
      `,
      [companyName || "My Company"]
    );

    const company = companyResult.rows[0];

    const userResult = await query(
      `
      INSERT INTO users
      (
        email,
        password,
        name,
        company_id,
        role,
        is_pro
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        email,
        hashedPassword,
        name || "Owner",
        company.id,
        "admin",
        false,
      ]
    );

    const user = userResult.rows[0];
    user.company_name = company.name;

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: "",
        role: "admin",
        companyId: company.id,
        companyName: company.name,
        jobTitle: "",
        isPro: false,
      },
    });
  } catch (error) {
    console.error("💥 REGISTER ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* =======================
   GET PROFILE
======================= */
router.get(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await query(
        `
        SELECT
          u.id,
          u.email,
          COALESCE(u.name,'') AS name,
          COALESCE(u.phone,'') AS phone,
          COALESCE(u.role,'employee') AS role,
          u.company_id,
          COALESCE(u.is_pro,false) AS is_pro,
          COALESCE(u.job_title,'') AS job_title,
          COALESCE(c.name,'') AS company_name
        FROM users u
        LEFT JOIN companies c
        ON c.id = u.company_id
        WHERE u.id = $1
        LIMIT 1
        `,
        [req.user.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("💥 GET PROFILE ERROR:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  }
);

/* =======================
   UPDATE PROFILE
======================= */
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

      await query(
        `
        UPDATE users
        SET
          name = $1,
          phone = $2,
          job_title = $3
        WHERE id = $4
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

      const updated = await query(
        `
        SELECT
          u.id,
          u.email,
          COALESCE(u.name,'') AS name,
          COALESCE(u.phone,'') AS phone,
          COALESCE(u.role,'employee') AS role,
          u.company_id,
          COALESCE(u.is_pro,false) AS is_pro,
          COALESCE(u.job_title,'') AS job_title,
          COALESCE(c.name,'') AS company_name
        FROM users u
        LEFT JOIN companies c
        ON c.id = u.company_id
        WHERE u.id = $1
        LIMIT 1
        `,
        [req.user.id]
      );

      res.json(updated.rows[0]);
    } catch (error) {
      console.error("💥 UPDATE PROFILE ERROR:", error);

      res.status(500).json({
        error: error.message,
      });
    }
  }
);

/* =======================
   APPLY ACCESS CODE
======================= */
router.post(
  "/apply-code",
  authenticateToken,
  async (req, res) => {
    try {
      const { code } = req.body;

      if (code !== "FULLACCESS2026") {
        return res.status(400).json({
          error: "Invalid code",
        });
      }

      await query(
        `
        UPDATE users
        SET is_pro = true
        WHERE id = $1
        `,
        [req.user.id]
      );

      res.json({
        success: true,
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

module.exports = router;