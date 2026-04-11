const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { query } = require("../database/connection");

const {
  authenticateToken,
  requireRole,
  requireCompany,
} = require("../middleware/auth");

const router = express.Router();

//
// ====================================
// 🔐 TOKEN BUILDER
// ====================================
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.company_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

//
// ====================================
// 🔐 LOGIN
// ====================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    const result = await query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const valid = await bcrypt.compare(
      password,
      user.password
    );

    if (!valid) {
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
        role: user.role,
        companyId: user.company_id,
        isPro: user.is_pro || false,
      },
    });
  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({
      error: "Login failed",
    });
  }
});

//
// ====================================
// 🆕 REGISTER (PUBLIC FIRST USER)
// ====================================
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

    const existing = await query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length) {
      return res.status(400).json({
        error: "Email already exists",
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
        INSERT INTO companies (name)
        VALUES ($1)
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
        (email,password,name,role,company_id)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
      `,
        [
          email,
          hashed,
          name || "Owner",
          "admin",
          company.id,
        ]
      );

    const user =
      userRes.rows[0];

    const token =
      createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId:
          user.company_id,
      },
    });
  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Registration failed",
    });
  }
});

//
// ====================================
// 👤 GET PROFILE
// ====================================
router.get(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const result =
        await query(
          `
        SELECT
          id,email,name,phone,
          role,company_id,is_pro
        FROM users
        WHERE id = $1
      `,
          [req.user.id]
        );

      res.json(
        result.rows[0]
      );
    } catch (error) {
      res.status(500).json({
        error:
          "Failed to load profile",
      });
    }
  }
);

//
// ====================================
// ✏️ UPDATE PROFILE
// ====================================
router.put(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        name,
        phone,
        companyName,
      } = req.body;

      const result =
        await query(
          `
        UPDATE users
        SET
          name = $1,
          phone = $2
        WHERE id = $3
        RETURNING
          id,email,name,phone,
          role,company_id,is_pro
      `,
          [
            name || "",
            phone || "",
            req.user.id,
          ]
        );

      if (companyName) {
        await query(
          `
          UPDATE companies
          SET name = $1
          WHERE id = $2
        `,
          [
            companyName,
            req.user.companyId,
          ]
        );
      }

      res.json(
        result.rows[0]
      );
    } catch (error) {
      console.error(
        "PROFILE UPDATE ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Failed to save profile",
      });
    }
  }
);

module.exports = router;