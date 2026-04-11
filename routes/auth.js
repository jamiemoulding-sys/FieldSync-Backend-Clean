console.log("🔥 AUTH ROUTES LOADED");

const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../database/connection");
const { authenticateToken } = require("../middleware/auth");

//
// =======================
// TOKEN BUILDER
// =======================
function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      companyId: user.company_id || null,
      role: user.role || "admin",
      isPro: user.is_pro || false,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

//
// =======================
// LOGIN
// =======================
router.post("/login", async (req, res) => {
  try {
    console.log("🔥 LOGIN HIT");

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Missing email or password",
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

    if (!user.password) {
      return res.status(400).json({
        error: "No password set",
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
        name: user.name || "User",
        phone: user.phone || "",
        role: user.role || "admin",
        companyId: user.company_id,
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

//
// =======================
// REGISTER
// =======================
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

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const companyResult = await query(
      `
      INSERT INTO companies (name)
      VALUES ($1)
      RETURNING *
      `,
      [companyName || "My Company"]
    );

    const company = companyResult.rows[0];

    const userResult = await query(
      `
      INSERT INTO users
      (email, password, name, company_id, role)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [
        email,
        hashedPassword,
        name || "Owner",
        company.id,
        "admin",
      ]
    );

    const user = userResult.rows[0];

    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || "Owner",
        phone: "",
        role: "admin",
        companyId: company.id,
        isPro: false,
      },
      company,
    });

  } catch (error) {
    console.error("💥 REGISTER ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

//
// =======================
// GET PROFILE
// =======================
router.get(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await query(
        `
        SELECT id,email,name,phone,role,company_id,is_pro
        FROM users
        WHERE id = $1
        `,
        [req.user.id]
      );

      const user = result.rows[0];

      res.json(user);

    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

//
// =======================
// UPDATE PROFILE
// =======================
router.put(
  "/me",
  authenticateToken,
  async (req, res) => {
    try {
      const { name, phone } = req.body;

      const result = await query(
        `
        UPDATE users
        SET name = $1,
            phone = $2
        WHERE id = $3
        RETURNING id,email,name,phone,role,company_id,is_pro
        `,
        [
          name || "",
          phone || "",
          req.user.id,
        ]
      );

      res.json(result.rows[0]);

    } catch (error) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

//
// =======================
// APPLY ACCESS CODE
// =======================
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