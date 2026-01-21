/**
 * Manual trigger for auto-renew job
 * Run with: node scripts/run-auto-renew.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const jobs = require('../services/jobs');

async function main() {
  console.log('Setting up database connection...');

  const pool = new Pool({
    host: process.env.DB_HOST || 'worxtech-db',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'worxtech',
    user: process.env.DB_USER || 'worxtech',
    password: process.env.DB_PASSWORD
  });

  // Initialize jobs with database pool
  jobs.init(pool);

  console.log('Starting auto-renew job...');
  console.log('==========================================');

  try {
    await jobs.autoRenewDomains();
    console.log('==========================================');
    console.log('Auto-renew job completed!');
  } catch (error) {
    console.error('Auto-renew job failed:', error);
  }

  // Close pool
  await pool.end();
  process.exit(0);
}

main();
