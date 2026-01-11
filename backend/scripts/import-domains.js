#!/usr/bin/env node
/**
 * Import all domains from eNom to the WorxTech database
 * Run this on TrueNAS with: node /mnt/user/appdata/worxtech-store/backend/scripts/import-domains.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Known domains to import
const domains = [
  // Main account domains
  {
    domain_name: 'amymorganbookkeeping.com',
    tld: 'com',
    expiration_date: '2026-09-13',
    auto_renew: false,
    privacy_enabled: false,
    enom_order_id: '379209143',
    enom_account: 'main'
  },
  {
    domain_name: 'plantry.us',
    tld: 'us',
    expiration_date: '2027-01-02',
    auto_renew: false,
    privacy_enabled: false,
    enom_order_id: '179931482',
    enom_account: 'main'
  },
  {
    domain_name: 'synd.space',
    tld: 'space',
    expiration_date: '2026-12-18',
    auto_renew: false,
    privacy_enabled: false,
    enom_order_id: '377468633',
    enom_account: 'main'
  },
  {
    domain_name: 'worxtech.biz',
    tld: 'biz',
    expiration_date: '2026-08-18',
    auto_renew: false,
    privacy_enabled: false,
    enom_order_id: '374268767',
    enom_account: 'main'
  },
  // Sub-account domains
  {
    domain_name: 'gobig.construction',
    tld: 'construction',
    expiration_date: '2026-05-16',
    auto_renew: false,
    privacy_enabled: true,
    enom_order_id: '178522557',
    enom_account: 'gobigconstruction'
  },
  {
    domain_name: 'nelsonnorbury.net',
    tld: 'net',
    expiration_date: '2026-08-19',
    auto_renew: false,
    privacy_enabled: false,
    enom_order_id: '374268769',
    enom_account: 'nelsonnorbury'
  }
];

async function ensureColumn() {
  try {
    await pool.query(`ALTER TABLE domains ADD COLUMN IF NOT EXISTS enom_account VARCHAR(100) DEFAULT 'main'`);
    console.log('Ensured enom_account column exists');
  } catch (err) {
    console.error('Error adding column:', err.message);
  }
}

async function ensureTlds() {
  const tlds = [
    { tld: 'construction', cost: 25.00, price: 34.99 },
    { tld: 'space', cost: 8.99, price: 14.99 }
  ];

  for (const t of tlds) {
    try {
      await pool.query(`
        INSERT INTO tld_pricing (tld, cost_register, cost_renew, cost_transfer, price_register, price_renew, price_transfer)
        VALUES ($1, $2, $2, $2, $3, $3, $3)
        ON CONFLICT (tld) DO NOTHING
      `, [t.tld, t.cost, t.price]);
      console.log(`Ensured TLD pricing for .${t.tld}`);
    } catch (err) {
      console.error(`Error adding TLD ${t.tld}:`, err.message);
    }
  }
}

async function importDomains() {
  // Get admin user (first user or user_id 1)
  const userResult = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
  const userId = userResult.rows.length > 0 ? userResult.rows[0].id : 1;

  console.log(`Using user_id: ${userId}`);

  for (const d of domains) {
    try {
      await pool.query(`
        INSERT INTO domains (user_id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled, enom_order_id, enom_account)
        VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
        ON CONFLICT (domain_name) DO UPDATE SET
          expiration_date = EXCLUDED.expiration_date,
          auto_renew = EXCLUDED.auto_renew,
          privacy_enabled = EXCLUDED.privacy_enabled,
          enom_order_id = EXCLUDED.enom_order_id,
          enom_account = EXCLUDED.enom_account,
          updated_at = CURRENT_TIMESTAMP
      `, [userId, d.domain_name, d.tld, d.expiration_date, d.auto_renew, d.privacy_enabled, d.enom_order_id, d.enom_account]);

      console.log(`Imported: ${d.domain_name} (${d.enom_account})`);
    } catch (err) {
      console.error(`Error importing ${d.domain_name}:`, err.message);
    }
  }
}

async function main() {
  try {
    console.log('Starting domain import...');
    await ensureColumn();
    await ensureTlds();
    await importDomains();
    console.log('\\nImport complete!');

    // Show current domains
    const result = await pool.query('SELECT domain_name, tld, expiration_date, enom_account FROM domains ORDER BY domain_name');
    console.log('\\nDomains in database:');
    result.rows.forEach(row => {
      console.log(`  ${row.domain_name} - expires ${row.expiration_date?.toISOString().split('T')[0] || 'N/A'} (${row.enom_account})`);
    });
  } catch (err) {
    console.error('Import failed:', err);
  } finally {
    await pool.end();
  }
}

main();
