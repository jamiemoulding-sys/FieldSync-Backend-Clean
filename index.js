require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// ROUTES
const authRoutes = require('./routes/auth');
const shiftRoutes = require('./routes/shifts');
const taskRoutes = require('./routes/tasks');
const locationRoutes = require('./routes/locations');
const uploadRoutes = require('./routes/uploads');
const assignmentRoutes = require('./routes/assignments');
const userRoutes = require('./routes/users');
const paymentRoutes = require('./routes/payments');
const scheduleRoutes = require('./routes/schedules');
const companyRoutes = require('./routes/companies');
const invitesRoutes = require('./routes/invites');
const reportRoutes = require('./routes/reports');
const billingRoutes = require('./routes/billing');
const performanceRoutes = require('./routes/performance');
const dashboardRoutes = require('./routes/dashboard'); // ✅ dashboard

const app = express();
const PORT = process.env.PORT || 10000;

// =====================
// 🔐 MIDDLEWARE
// =====================

// Stripe webhook (must be raw BEFORE json)
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// ✅ FIXED CORS (THIS WAS THE ISSUE)
const corsOptions = {
  origin: [
    "https://app.zorviatech.co.uk",
    "http://localhost:3000"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // 🔥 preflight fix

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =====================
// 🚀 ROUTES
// =====================

app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api', invitesRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/performance', performanceRoutes);

// ✅ DASHBOARD
app.use('/api/dashboard', dashboardRoutes);

// =====================
// ❤️ HEALTH CHECK
// =====================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    time: new Date()
  });
});

// =====================
// ❌ GLOBAL ERROR HANDLER
// =====================

app.use((err, req, res, next) => {
  console.error('💥 GLOBAL ERROR:', err.stack);

  res.status(500).json({
    error: 'Something went wrong',
    message: err.message
  });
});

// =====================
// 🚀 START SERVER
// =====================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});