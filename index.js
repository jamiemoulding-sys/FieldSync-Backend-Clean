// 🔥 SUPABASE FIX (Headers issue)
const fetch = require('node-fetch');

global.fetch = fetch;
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

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
const reportRoutes = require('./routes/reports');
const billingRoutes = require('./routes/billing');
const performanceRoutes = require('./routes/performance');
const dashboardRoutes = require('./routes/dashboard');

// 🔥 ONLY IMPORT ONCE
const inviteRoutes = require('./routes/invite');

const app = express();
const PORT = process.env.PORT || 10000;

// =====================
// 🔐 CORS FIX
// =====================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// =====================
// MIDDLEWARE
// =====================

// Stripe webhook (must be raw BEFORE json)
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =====================
// ✅ ROUTES (CLEAN)
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

// 🔥 FIXED INVITE ROUTE (ONLY HERE)
app.use('/api/invite', inviteRoutes);

app.use('/api/reports', reportRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/dashboard', dashboardRoutes);

// =====================
// HEALTH
// =====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// =====================
// ERROR HANDLER
// =====================

app.use((err, req, res, next) => {
  console.error('💥 ERROR:', err);
  res.status(500).json({ error: err.message });
});

// =====================
// START
// =====================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});