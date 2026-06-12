/**
 * Reset a user's password.
 *
 * Usage: node reset-admin-password.js <new-password> [user-id]
 *
 * The password MUST be supplied on the command line — there is NO hardcoded
 * default. A committed default ("REDACTED") reset the primary admin
 * account (id 1) to a publicly-known value, which is an account-takeover risk in
 * a public repo.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const password = process.argv[2];
const userId = parseInt(process.argv[3] || '1', 10);

if (!password || password.length < 12) {
  console.error('Usage: node reset-admin-password.js <new-password> [user-id]');
  console.error('A password of at least 12 characters is required (no default).');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST || 'worxtech-db',
  database: process.env.DB_NAME || 'worxtech',
  user: process.env.DB_USER || 'worxtech',
  password: process.env.DB_PASSWORD
});

async function resetPassword() {
  const hash = bcrypt.hashSync(password, 10);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING email',
    [hash, userId]
  );
  if (result.rows.length === 0) {
    console.error(`No user with id ${userId}.`);
  } else {
    // Deliberately do not print the password.
    console.log(`Password updated for ${result.rows[0].email} (id ${userId}).`);
  }
  await pool.end();
}

resetPassword().catch((e) => { console.error(e.message); process.exit(1); });
