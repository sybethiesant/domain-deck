#!/usr/bin/env node
/**
 * Manual domain sync script
 * Run with: node scripts/sync-domains.js
 */

require('dotenv').config();
const enom = require('../services/enom');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'worxtech-db',
  database: process.env.DB_NAME || 'worxtech',
  user: process.env.DB_USER || 'worxtech',
  password: process.env.DB_PASSWORD
});

async function syncDomains() {
  console.log('Starting domain sync...');

  try {
    const result = await pool.query(`
      SELECT id, domain_name FROM domains
      WHERE status = 'active' OR status = 'pending'
      ORDER BY last_synced_at ASC NULLS FIRST
    `);

    console.log(`Found ${result.rows.length} domains to sync`);

    let synced = 0;
    let failed = 0;

    for (const domain of result.rows) {
      const parts = domain.domain_name.split('.');
      const tld = parts.pop();
      const sld = parts.join('.');

      try {
        console.log(`\nSyncing ${domain.domain_name}...`);
        const data = await enom.getFullDomainData(sld, tld);

        console.log(`  Nameservers: ${data.nameservers.join(', ') || 'none'}`);
        console.log(`  Auto-renew: ${data.autoRenew}`);
        console.log(`  Privacy: ${data.privacyEnabled}`);
        console.log(`  Lock: ${data.lockStatus}`);
        console.log(`  Expiration: ${data.expirationDate}`);

        // Parse expiration date
        let expDate = null;
        if (data.expirationDate) {
          const match = data.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            expDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          }
        }

        await pool.query(`
          UPDATE domains SET
            expiration_date = COALESCE($1, expiration_date),
            auto_renew = $2,
            privacy_enabled = $3,
            lock_status = $4,
            nameservers = $5,
            enom_domain_id = $6,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $7
        `, [
          expDate,
          data.autoRenew,
          data.privacyEnabled,
          data.lockStatus,
          JSON.stringify(data.nameservers),
          data.domainNameId,
          domain.id
        ]);

        synced++;
        console.log(`  ✓ Synced successfully`);
      } catch (e) {
        failed++;
        console.log(`  ✗ Failed: ${e.message}`);
      }

      // Small delay
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n=== Sync Complete ===`);
    console.log(`Synced: ${synced}`);
    console.log(`Failed: ${failed}`);

  } catch (error) {
    console.error('Sync error:', error);
  } finally {
    await pool.end();
  }
}

syncDomains();
