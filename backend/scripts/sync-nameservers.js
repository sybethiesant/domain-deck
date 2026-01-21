/**
 * One-time script to sync all domain nameservers using per-domain mode
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

async function syncAll() {
  try {
    // Get all domains with their modes
    const result = await pool.query(`
      SELECT id, domain_name, tld, enom_mode
      FROM domains
      WHERE status = 'active' OR status IS NULL
    `);
    console.log(`Found ${result.rows.length} domains to sync`);

    let synced = 0, failed = 0;

    for (const domain of result.rows) {
      const sld = domain.domain_name;
      const tld = domain.tld;
      const mode = domain.enom_mode || 'test';

      try {
        const data = await enom.getFullDomainData(sld, tld, { mode });

        let expDate = null;
        if (data.expirationDate) {
          const match = data.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            expDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          }
        }

        await pool.query(
          `UPDATE domains SET
            nameservers = $1,
            expiration_date = COALESCE($2, expiration_date),
            privacy_enabled = $3,
            lock_status = $4,
            last_synced_at = CURRENT_TIMESTAMP
          WHERE id = $5`,
          [JSON.stringify(data.nameservers), expDate, data.privacyEnabled, data.lockStatus, domain.id]
        );
        synced++;
        console.log(`Synced: ${sld}.${tld} - ${data.nameservers.length} nameservers`);
      } catch (e) {
        failed++;
        console.error(`Failed: ${sld}.${tld} - ${e.message}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\nDone! Synced: ${synced}, Failed: ${failed}`);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

syncAll();
