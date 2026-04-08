process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { Pool } = require('pg');

console.log("📡 Initializing DB connection...");
console.log("📡 DATABASE_URL:", process.env.DATABASE_URL ? "Loaded ✅" : "MISSING ❌");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // ✅ Correct SSL config for Supabase
  ssl: {
    rejectUnauthorized: false,
  },
});

// ✅ Test connection immediately on startup
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Database connected successfully");
    client.release();
  } catch (err) {
    console.error("💥 DATABASE CONNECTION FAILED:", err.message);
  }
})();

// ✅ Log pool events
pool.on('connect', () => {
  console.log('🔗 New DB connection established');
});

pool.on('error', (err) => {
  console.error('💥 DB POOL ERROR:', err.message);
});

// ✅ Export query helper
module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error("💥 QUERY ERROR:", err.message);
      throw err; // IMPORTANT: don’t swallow errors
    }
  },
};