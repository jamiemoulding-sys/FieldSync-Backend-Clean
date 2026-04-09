const { Pool } = require('pg');

console.log("📡 Initializing DB connection...");
console.log("📡 DATABASE_URL:", process.env.DATABASE_URL ? "Loaded ✅" : "Missing ❌");

const connectionString = process.env.DATABASE_URL;

// 🔥 FORCE SSL PROPERLY (this is the key fix)
const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// 🔥 Test connection
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ DATABASE CONNECTED');
    client.release();
  } catch (err) {
    console.error('💥 DATABASE CONNECTION FAILED:', err);
  }
})();

// 🔥 Query wrapper
module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.error("💥 QUERY ERROR:", err);
      throw err;
    }
  }
};