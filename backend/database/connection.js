const { Pool } = require('pg');

const useConnectionString = !!process.env.DATABASE_URL;
const pool = useConnectionString
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
      user: process.env.PGUSER || process.env.DB_USER || 'postgres',
      password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
      database: process.env.PGDATABASE || process.env.DB_NAME || 'cameraapp',
      port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    });

async function query(text, params) {
  return pool.query(text, params);
}

async function end() {
  await pool.end();
}

module.exports = { pool, query, end };

