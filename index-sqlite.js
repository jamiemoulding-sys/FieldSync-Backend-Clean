const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const shiftRoutes = require('./routes/shifts');
const taskRoutes = require('./routes/tasks');
const locationRoutes = require('./routes/locations');
const uploadRoutes = require('./routes/uploads');
const { authenticateToken } = require('./middleware/auth');
const { initDatabase } = require('./database/sqlite-init');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/uploads', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Dashboard endpoint
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const isManager = req.user?.role === 'manager';
    const { query } = require('./database/sqlite-connection');

    let dashboardData = {};

    if (isManager) {
      // Manager dashboard data
      const [activeShifts, totalEmployees, totalTasks, recentCompletions] = await Promise.all([
        query(`
          SELECT s.*, u.name as user_name, l.name as location_name
          FROM shifts s
          JOIN users u ON s.user_id = u.id
          JOIN locations l ON s.location_id = l.id
          WHERE s.clock_out_time IS NULL
          ORDER BY s.clock_in_time DESC
        `),
        query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['employee']),
        query('SELECT COUNT(*) as count FROM tasks WHERE is_active = true'),
        query(`
          SELECT tc.*, t.title as task_title, u.name as user_name, l.name as location_name
          FROM task_completions tc
          JOIN tasks t ON tc.task_id = t.id
          JOIN users u ON tc.user_id = u.id
          JOIN shifts s ON tc.shift_id = s.id
          JOIN locations l ON s.location_id = l.id
          ORDER BY tc.completed_at DESC
          LIMIT 10
        `)
      ]);

      dashboardData = {
        activeShifts: activeShifts.rows,
        totalEmployees: totalEmployees.rows[0].count,
        totalTasks: totalTasks.rows[0].count,
        recentCompletions: recentCompletions.rows
      };
    } else {
      // Employee dashboard data
      const [activeShift, shiftHistory, todayTasks] = await Promise.all([
        query(`
          SELECT s.*, l.name as location_name, l.address as location_address
          FROM shifts s
          JOIN locations l ON s.location_id = l.id
          WHERE s.user_id = ? AND s.clock_out_time IS NULL
        `, [userId]),
        query(`
          SELECT s.*, l.name as location_name
          FROM shifts s
          JOIN locations l ON s.location_id = l.id
          WHERE s.user_id = ?
          ORDER BY s.clock_in_time DESC
          LIMIT 5
        `, [userId]),
        query(`
          SELECT COUNT(*) as count
          FROM task_completions tc
          WHERE tc.user_id = ? AND tc.completed_at >= date('now')
        `, [userId])
      ]);

      dashboardData = {
        activeShift: activeShift.rows[0] || null,
        shiftHistory: shiftHistory.rows,
        tasksCompletedToday: todayTasks.rows[0].count
      };
    }

    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
  error: "REAL_ERROR",
  message: error.message
});
  }
});

// Initialize database and start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log('Using SQLite database for testing');
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
