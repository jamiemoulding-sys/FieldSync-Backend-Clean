require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// ✅ CORRECT ROUTES (NO /src)
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

const { authenticateToken } = require('./middleware/auth');
const { initDatabase } = require('./database/init');
const { query } = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 10000;

// =====================
// MIDDLEWARE
// =====================

app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =====================
// ROUTES
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

// =====================
// HEALTH CHECK
// =====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date() });
});

// =====================
// DASHBOARD
// =====================

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const [tasks, shifts] = await Promise.all([
      query(`SELECT COUNT(*) FROM tasks`),
      query(`SELECT COUNT(*) FROM shifts WHERE clock_out_time IS NULL`)
    ]);

    res.json({
      tasks: parseInt(tasks.rows[0].count),
      activeShifts: parseInt(shifts.rows[0].count)
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// START SERVER
// =====================

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// =====================
// DB INIT
// =====================

initDatabase()
  .then(() => console.log('✅ Database initialized'))
  .catch(err => console.error('DB INIT ERROR:', err));