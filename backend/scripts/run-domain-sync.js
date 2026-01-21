/**
 * Manual trigger for domain sync job
 * Run with: node scripts/run-domain-sync.js
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

  console.log('Starting domain sync job...');
  console.log('==========================================');

  try {
    await jobs.syncDomains();
    console.log('==========================================');
    console.log('Domain sync job completed!');
  } catch (error) {
    console.error('Domain sync job failed:', error);
  }

  // Close pool
  await pool.end();
  process.exit(0);
}

main();
