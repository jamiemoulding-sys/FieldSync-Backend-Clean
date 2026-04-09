const { Pool } = require('pg');

let pool;

const connectWithRetry = () => {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.connect()
    .then(() => {
      console.log('✅ DATABASE CONNECTED');
    })
    .catch(err => {
      console.error('❌ DB CONNECTION FAILED, RETRYING...', err.message);
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

module.exports = {
  query: (text, params) => pool.query(text, params),
};