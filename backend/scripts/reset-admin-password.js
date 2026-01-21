/**
 * Reset admin password for testing
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'worxtech-db',
  database: process.env.DB_NAME || 'worxtech',
  user: process.env.DB_USER || 'worxtech',
  password: process.env.DB_PASSWORD
});

async function resetPassword() {
  const password = 'REDACTED';
  const hash = bcrypt.hashSync(password, 10);
  console.log('Generated hash:', hash);

  await pool.query('UPDATE users SET password_hash = $1 WHERE id = 1', [hash]);
  console.log('Password updated to:', password);

  // Verify
  const result = await pool.query('SELECT email, password_hash FROM users WHERE id = 1');
  console.log('User:', result.rows[0].email);
  console.log('Hash stored:', result.rows[0].password_hash.substring(0, 30) + '...');

  await pool.end();
}

resetPassword().catch(console.error);
