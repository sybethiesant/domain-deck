/**
 * Admin eNom Integration Routes
 * eNom sync, import, and account management
 */
const express = require('express');
const router = express.Router();
const { logAudit } = require('../../middleware/auth');
const enom = require('../../services/enom');

// Sync domains from eNom
router.post('/sync-enom', async (req, res) => {
  const pool = req.app.locals.pool;
  const { user_id = 1 } = req.body;

  try {
    // Get all domains from main account
    const enomDomains = await enom.getAllDomains();

    // Get sub-accounts and their domains
    const subAccounts = await enom.getSubAccounts();

    const imported = [];
    const errors = [];

    // Import main account domains
    for (const domain of enomDomains) {
      try {
        // Parse expiration date
        let expDate = null;
        if (domain.expirationDate) {
          const parts = domain.expirationDate.split('/');
          if (parts.length === 3) {
            expDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }

        // Upsert domain
        await pool.query(`
          INSERT INTO domains (user_id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled, enom_order_id, enom_account)
          VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, 'main')
          ON CONFLICT (domain_name) DO UPDATE SET
            expiration_date = COALESCE(EXCLUDED.expiration_date, domains.expiration_date),
            auto_renew = EXCLUDED.auto_renew,
            privacy_enabled = EXCLUDED.privacy_enabled,
            enom_order_id = COALESCE(EXCLUDED.enom_order_id, domains.enom_order_id),
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `, [user_id, domain.domain, domain.tld, expDate, domain.autoRenew, domain.privacyEnabled, domain.domainNameId]);

        imported.push({ domain: domain.domain, account: 'main' });
      } catch (err) {
        errors.push({ domain: domain.domain, error: err.message });
      }
    }

    // Try to get domains from sub-accounts
    for (const subAccount of subAccounts) {
      if (subAccount.domainCount > 0) {
        // Try domain based on email
        if (subAccount.email) {
          const emailDomain = subAccount.email.split('@')[1];
          if (emailDomain) {
            const parts = emailDomain.split('.');
            if (parts.length >= 2) {
              const sld = parts.slice(0, -1).join('.');
              const tld = parts[parts.length - 1];

              try {
                const info = await enom.getDomainInfo(sld, tld);

                if (info.status) {
                  let expDate = null;
                  if (info.expirationDate) {
                    const expParts = info.expirationDate.split(' ')[0].split('/');
                    if (expParts.length === 3) {
                      expDate = `${expParts[2]}-${expParts[0].padStart(2, '0')}-${expParts[1].padStart(2, '0')}`;
                    }
                  }

                  await pool.query(`
                    INSERT INTO domains (user_id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled, enom_account)
                    VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
                    ON CONFLICT (domain_name) DO UPDATE SET
                      expiration_date = COALESCE(EXCLUDED.expiration_date, domains.expiration_date),
                      auto_renew = EXCLUDED.auto_renew,
                      privacy_enabled = EXCLUDED.privacy_enabled,
                      enom_account = EXCLUDED.enom_account,
                      last_synced_at = CURRENT_TIMESTAMP,
                      updated_at = CURRENT_TIMESTAMP
                  `, [user_id, `${sld}.${tld}`, tld, expDate, info.autoRenew || false, info.whoisPrivacy || false, subAccount.loginId]);

                  imported.push({ domain: `${sld}.${tld}`, account: subAccount.loginId });
                }
              } catch (err) {
                // Domain might not exist or not be accessible
              }
            }
          }
        }
      }
    }

    await logAudit(pool, req.user.id, 'sync_enom', 'system', null, null, { imported: imported.length, errors: errors.length }, req);

    res.json({
      message: 'eNom sync completed',
      imported: imported.length,
      domains: imported,
      errors: errors.length > 0 ? errors : undefined,
      subAccounts: subAccounts
    });
  } catch (error) {
    console.error('eNom sync error:', error);
    res.status(500).json({ error: 'Failed to sync from eNom', details: error.message });
  }
});

// Get eNom sub-accounts
router.get('/enom/subaccounts', async (req, res) => {
  try {
    const subAccounts = await enom.getSubAccounts();
    res.json(subAccounts);
  } catch (error) {
    console.error('Error fetching sub-accounts:', error);
    res.status(500).json({ error: 'Failed to fetch sub-accounts', details: error.message });
  }
});

// Get eNom balance
router.get('/enom/balance', async (req, res) => {
  try {
    const balance = await enom.getBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance', details: error.message });
  }
});

// Import specific domain by name
router.post('/enom/import-domain', async (req, res) => {
  const pool = req.app.locals.pool;
  const { domain, user_id = 1, enom_account = 'main' } = req.body;

  if (!domain) {
    return res.status(400).json({ error: 'Domain name required' });
  }

  try {
    const parts = domain.toLowerCase().split('.');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    const tld = parts.pop();
    const sld = parts.join('.');

    // Get domain info from eNom
    const info = await enom.getDomainInfo(sld, tld);

    // Parse dates
    let expDate = null;
    if (info.expirationDate) {
      const expMatch = info.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (expMatch) {
        expDate = `${expMatch[3]}-${expMatch[1].padStart(2, '0')}-${expMatch[2].padStart(2, '0')}`;
      }
    }

    let regDate = null;
    if (info.registrationDate) {
      const regMatch = info.registrationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (regMatch) {
        regDate = `${regMatch[3]}-${regMatch[1].padStart(2, '0')}-${regMatch[2].padStart(2, '0')}`;
      }
    }

    // Get nameservers
    const nameservers = await enom.getNameservers(sld, tld);

    // Upsert domain
    const result = await pool.query(`
      INSERT INTO domains (user_id, domain_name, tld, status, registration_date, expiration_date, auto_renew, privacy_enabled, nameservers, enom_account, last_synced_at)
      VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (domain_name) DO UPDATE SET
        expiration_date = EXCLUDED.expiration_date,
        auto_renew = EXCLUDED.auto_renew,
        privacy_enabled = EXCLUDED.privacy_enabled,
        nameservers = EXCLUDED.nameservers,
        enom_account = EXCLUDED.enom_account,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [user_id, `${sld}.${tld}`, tld, regDate, expDate, info.autoRenew || false, info.whoisPrivacy || false, JSON.stringify(nameservers), enom_account]);

    await logAudit(pool, req.user.id, 'import_domain', 'domain', result.rows[0].id, null, { domain: `${sld}.${tld}` }, req);

    res.json({
      message: 'Domain imported successfully',
      domain: result.rows[0],
      enomInfo: info
    });
  } catch (error) {
    console.error('Error importing domain:', error);
    res.status(500).json({ error: 'Failed to import domain', details: error.message });
  }
});

// Get pending transfers from eNom
router.get('/enom/transfers', async (req, res) => {
  try {
    const transfers = await enom.getPendingTransfers();
    res.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: 'Failed to fetch transfers', details: error.message });
  }
});

// Get transfer status
router.get('/enom/transfers/:transferOrderId', async (req, res) => {
  const { transferOrderId } = req.params;

  try {
    const status = await enom.getTransferStatus(transferOrderId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching transfer status:', error);
    res.status(500).json({ error: 'Failed to fetch transfer status', details: error.message });
  }
});

// Resend transfer auth email
router.post('/enom/transfers/:transferOrderId/resend', async (req, res) => {
  const pool = req.app.locals.pool;
  const { transferOrderId } = req.params;

  try {
    const result = await enom.resendTransferAuth(transferOrderId);

    await logAudit(pool, req.user.id, 'resend_transfer_auth', 'transfer', null, null, { transferOrderId }, req);

    res.json(result);
  } catch (error) {
    console.error('Error resending transfer auth:', error);
    res.status(500).json({ error: 'Failed to resend auth email', details: error.message });
  }
});

// Cancel pending transfer
router.post('/enom/transfers/:transferOrderId/cancel', async (req, res) => {
  const pool = req.app.locals.pool;
  const { transferOrderId } = req.params;

  try {
    const result = await enom.cancelTransfer(transferOrderId);

    await logAudit(pool, req.user.id, 'cancel_transfer', 'transfer', null, null, { transferOrderId }, req);

    res.json(result);
  } catch (error) {
    console.error('Error cancelling transfer:', error);
    res.status(500).json({ error: 'Failed to cancel transfer', details: error.message });
  }
});

// Check domain availability (admin version with premium pricing)
router.get('/enom/check/:domain', async (req, res) => {
  const { domain } = req.params;

  try {
    const parts = domain.toLowerCase().split('.');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    const tld = parts.pop();
    const sld = parts.join('.');

    const result = await enom.checkDomain(sld, tld);
    res.json(result);
  } catch (error) {
    console.error('Error checking domain:', error);
    res.status(500).json({ error: 'Failed to check domain', details: error.message });
  }
});

module.exports = router;
