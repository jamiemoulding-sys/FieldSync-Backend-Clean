const { Pool } = require('pg');

console.log("📡 Initializing DB connection...");
console.log("📡 DATABASE_URL:", process.env.DATABASE_URL ? "Loaded ✅" : "Missing ❌");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 🔥 Test connection on startup
pool.connect()
  .then(() => {
    console.log('✅ DATABASE CONNECTED');
  })
  .catch(err => {
    console.error('💥 DATABASE CONNECTION FAILED:', err.message);
  });

// 🔥 Safe query wrapper
module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error("💥 QUERY ERROR:", err.message);
      throw err;
    }
  }
};