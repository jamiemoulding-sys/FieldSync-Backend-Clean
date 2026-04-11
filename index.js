// 🔥 SUPABASE FIX (Headers issue)

require("cross-fetch/polyfill");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

/* ROUTES */
const authRoutes = require("./routes/auth");
const shiftRoutes = require("./routes/shifts");
const taskRoutes = require("./routes/tasks");
const locationRoutes = require("./routes/locations");
const uploadRoutes = require("./routes/uploads");
const assignmentRoutes = require("./routes/assignments");
const userRoutes = require("./routes/users");
const paymentRoutes = require("./routes/payments");
const scheduleRoutes = require("./routes/schedules");
const companyRoutes = require("./routes/companies");
const reportRoutes = require("./routes/reports");
const billingRoutes = require("./routes/billing");
const performanceRoutes = require("./routes/performance");
const dashboardRoutes = require("./routes/dashboard");
const inviteRoutes = require("./routes/invite");
const announcementRoutes = require("./routes/announcements");

const app = express();
const PORT =
  process.env.PORT || 10000;

/* =====================
   TRUST PROXY
===================== */
app.set(
  "trust proxy",
  1
);

/* =====================
   CORS
===================== */
const allowedOrigins = [
  "https://app.zorviatech.co.uk",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (
      origin,
      callback
    ) {
      if (
        !origin ||
        allowedOrigins.includes(
          origin
        )
      ) {
        return callback(
          null,
          true
        );
      }

      return callback(
        new Error(
          "Blocked by CORS"
        )
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.options(
  "*",
  cors()
);

/* =====================
   WEBHOOK FIRST
===================== */
app.use(
  "/api/billing/webhook",
  express.raw({
    type: "application/json",
  })
);

/* =====================
   BODY PARSER
===================== */
app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
  })
);

/* =====================
   STATIC FILES
===================== */
app.use(
  "/uploads",
  express.static(
    path.join(
      __dirname,
      "uploads"
    )
  )
);

/* =====================
   HEALTH
===================== */
app.get(
  "/api/health",
  (req, res) => {
    res.json({
      status: "OK",
      uptime:
        process.uptime(),
      env:
        process.env
          .NODE_ENV ||
        "development",
    });
  }
);

/* =====================
   API ROUTES
===================== */
app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/shifts",
  shiftRoutes
);

app.use(
  "/api/tasks",
  taskRoutes
);

app.use(
  "/api/locations",
  locationRoutes
);

app.use(
  "/api/uploads",
  uploadRoutes
);

app.use(
  "/api/assignments",
  assignmentRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/payments",
  paymentRoutes
);

app.use(
  "/api/schedules",
  scheduleRoutes
);

app.use(
  "/api/companies",
  companyRoutes
);

app.use(
  "/api/invite",
  inviteRoutes
);

app.use(
  "/api/reports",
  reportRoutes
);

app.use(
  "/api/billing",
  billingRoutes
);

app.use(
  "/api/performance",
  performanceRoutes
);

app.use(
  "/api/dashboard",
  dashboardRoutes
);

app.use(
  "/api/announcements",
  announcementRoutes
);

/* =====================
   404
===================== */
app.use(
  "*",
  (req, res) => {
    res.status(404).json({
      error:
        "Route not found",
    });
  }
);

/* =====================
   ERROR HANDLER
===================== */
app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "💥 ERROR:",
      err
    );

    res.status(
      err.status || 500
    ).json({
      error:
        err.message ||
        "Internal server error",
    });
  }
);

/* =====================
   START
===================== */
app.listen(
  PORT,
  () => {
    console.log(
      `🚀 Server running on port ${PORT}`
    );
  }
);