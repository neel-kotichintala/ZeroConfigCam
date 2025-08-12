const { query } = require('./connection');

async function initDb() {
  // Create tables if they don't exist (MVP simple)
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS setup_sessions (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      camera_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS cameras (
      id SERIAL PRIMARY KEY,
      camera_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'offline'
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      wifi_ssid TEXT NOT NULL,
      wifi_password TEXT NOT NULL,
      qr_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { initDb };

