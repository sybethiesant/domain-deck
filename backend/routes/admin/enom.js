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
  const user_id = req.body?.user_id || 1;

  try {
    // Get current eNom mode for labeling domains
    const currentEnomMode = enom.getMode().mode;
    console.log('[Sync] Current eNom mode for labeling:', currentEnomMode);

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

        // Upsert domain (domain_name stores SLD only, not full domain)
        await pool.query(`
          INSERT INTO domains (user_id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled, enom_order_id, enom_account, enom_mode)
          VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, 'main', $8)
          ON CONFLICT (domain_name, tld) DO UPDATE SET
            expiration_date = COALESCE(EXCLUDED.expiration_date, domains.expiration_date),
            auto_renew = EXCLUDED.auto_renew,
            privacy_enabled = EXCLUDED.privacy_enabled,
            enom_order_id = COALESCE(EXCLUDED.enom_order_id, domains.enom_order_id),
            enom_mode = EXCLUDED.enom_mode,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `, [user_id, domain.sld, domain.tld, expDate, domain.autoRenew, domain.privacyEnabled, domain.domainNameId, currentEnomMode]);

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
                    INSERT INTO domains (user_id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled, enom_account, enom_mode)
                    VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
                    ON CONFLICT (domain_name, tld) DO UPDATE SET
                      expiration_date = COALESCE(EXCLUDED.expiration_date, domains.expiration_date),
                      auto_renew = EXCLUDED.auto_renew,
                      privacy_enabled = EXCLUDED.privacy_enabled,
                      enom_account = EXCLUDED.enom_account,
                      enom_mode = EXCLUDED.enom_mode,
                      last_synced_at = CURRENT_TIMESTAMP,
                      updated_at = CURRENT_TIMESTAMP
                  `, [user_id, sld, tld, expDate, info.autoRenew || false, info.whoisPrivacy || false, subAccount.loginId, currentEnomMode]);

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
    res.status(500).json({ error: 'Failed to sync from eNom' });
  }
});

// Get eNom sub-accounts
router.get('/enom/subaccounts', async (req, res) => {
  try {
    const subAccounts = await enom.getSubAccounts();
    res.json(subAccounts);
  } catch (error) {
    console.error('Error fetching sub-accounts:', error);
    res.status(500).json({ error: 'Failed to fetch sub-accounts' });
  }
});

// Get domains for a specific sub-account
router.get('/enom/subaccounts/:accountId/domains', async (req, res) => {
  const { accountId } = req.params;

  try {
    // First get sub-account details to get email
    const subAccounts = await enom.getSubAccounts();
    const subAccount = subAccounts.find(sa => sa.loginId === accountId);
    const email = subAccount?.email || null;

    const domains = await enom.getSubAccountDomains(accountId, email);
    res.json(domains);
  } catch (error) {
    console.error('Error fetching sub-account domains:', error);
    res.status(500).json({ error: 'Failed to fetch sub-account domains' });
  }
});

// Import a sub-account (create user and import domains)
router.post('/enom/subaccounts/:accountId/import', async (req, res) => {
  const { accountId } = req.params;
  const pool = req.app.locals.pool;
  const adminId = req.user.id;

  console.log(`[SubAccount Import] Attempting to import accountId: "${accountId}"`);

  try {
    // Get sub-account details
    const subAccounts = await enom.getSubAccounts();
    console.log(`[SubAccount Import] Found ${subAccounts.length} sub-accounts:`, subAccounts.map(sa => sa.loginId));
    const subAccount = subAccounts.find(sa => sa.loginId === accountId);

    if (!subAccount) {
      console.log(`[SubAccount Import] No match found for "${accountId}"`);
      return res.status(404).json({ error: 'Sub-account not found' });
    }

    console.log(`[SubAccount Import] Found sub-account:`, subAccount);

    if (!subAccount.email) {
      return res.status(400).json({ error: 'Sub-account has no email address' });
    }

    const normalizedEmail = subAccount.email.toLowerCase().trim();

    // Check if user already exists with this email
    const existingUser = await pool.query(
      'SELECT id, username, email, enom_subaccount_id FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    let userId;
    let userCreated = false;
    let username;

    if (existingUser.rows.length > 0) {
      // User already exists - use their account
      userId = existingUser.rows[0].id;
      username = existingUser.rows[0].username;

      // Update the enom_subaccount_id if not already set
      if (!existingUser.rows[0].enom_subaccount_id) {
        await pool.query(
          'UPDATE users SET enom_subaccount_id = $1 WHERE id = $2',
          [accountId, userId]
        );
      }
    } else {
      // Create new user account (no password - they'll use password reset)
      // Generate a unique username - prefer domain name or user's name over email prefix
      const emailParts = normalizedEmail.split('@');
      const emailPrefix = emailParts[0].replace(/[^a-zA-Z0-9_]/g, '');
      const emailDomain = emailParts[1] || '';

      // Extract domain name without TLD (e.g., "gobig" from "gobig.construction")
      const domainParts = emailDomain.split('.');
      const domainName = domainParts.length > 1
        ? domainParts.slice(0, -1).join('').replace(/[^a-zA-Z0-9_]/g, '')
        : '';

      // Build username preference order:
      // 1. Domain name (if not generic like "gmail", "yahoo", etc.)
      // 2. User's name (firstName + lastName)
      // 3. Email prefix (last resort)
      const genericDomains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'aol', 'icloud', 'mail', 'protonmail'];
      const isGenericDomain = genericDomains.some(d => domainName.toLowerCase().includes(d));

      let baseUsername;
      if (domainName && domainName.length >= 3 && !isGenericDomain) {
        baseUsername = domainName;
      } else if (subAccount.firstName || subAccount.lastName) {
        baseUsername = `${subAccount.firstName || ''}${subAccount.lastName || ''}`.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
      } else {
        baseUsername = emailPrefix;
      }

      // Fallback if still empty
      if (!baseUsername || baseUsername.length < 3) {
        baseUsername = `customer_${accountId.substring(0, 8)}`;
      }

      // Ensure username is unique
      let tryCount = 0;
      username = baseUsername.substring(0, 25); // Leave room for numbers
      while (true) {
        const checkUsername = await pool.query(
          'SELECT id FROM users WHERE LOWER(username) = $1',
          [username.toLowerCase()]
        );
        if (checkUsername.rows.length === 0) break;
        tryCount++;
        username = `${baseUsername.substring(0, 25)}_${tryCount}`;
        if (tryCount > 100) {
          username = `customer_${Date.now()}`;
          break;
        }
      }

      // Create user with placeholder password (they must reset)
      // The placeholder hash will never validate since it's not a real bcrypt hash
      const placeholderHash = '$2a$10$PLACEHOLDER_HASH_USER_MUST_RESET_PASSWORD';

      const userResult = await pool.query(
        `INSERT INTO users (
          username, email, password_hash, full_name, phone,
          email_verified, password_needs_reset, account_source, enom_subaccount_id
        ) VALUES ($1, $2, $3, $4, $5, false, true, 'migration', $6)
        RETURNING id, username, email`,
        [
          username,
          normalizedEmail,
          placeholderHash,
          `${subAccount.firstName || ''} ${subAccount.lastName || ''}`.trim() || null,
          null, // phone not available from sub-account
          accountId
        ]
      );

      userId = userResult.rows[0].id;
      userCreated = true;
    }

    // Get and import domains for this sub-account
    const domains = await enom.getSubAccountDomains(accountId, normalizedEmail);
    const importedDomains = [];
    const domainErrors = [];

    for (const domain of domains) {
      try {
        // Check if domain already exists
        const existingDomain = await pool.query(
          'SELECT id, user_id FROM domains WHERE LOWER(domain_name) = $1 AND tld = $2',
          [domain.domain_name.toLowerCase(), domain.tld]
        );

        if (existingDomain.rows.length > 0) {
          // Domain exists - update user_id if different
          if (existingDomain.rows[0].user_id !== userId) {
            await pool.query(
              'UPDATE domains SET user_id = $1, enom_account = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
              [userId, accountId, existingDomain.rows[0].id]
            );
          }
          importedDomains.push({ ...domain, status: 'updated' });
          continue;
        }

        // Get detailed domain info
        let domainInfo;
        try {
          domainInfo = await enom.getSubAccountDomainInfo(domain.domain_name, domain.tld, accountId);
        } catch (infoError) {
          // If we can't get info, still import with basic data
          domainInfo = {
            domain_name: domain.domain_name,
            tld: domain.tld,
            status: 'active',
            expiration_date: null,
            registration_date: null,
            auto_renew: false,
            lock_status: true,
            nameservers: []
          };
        }

        // Insert domain
        await pool.query(
          `INSERT INTO domains (
            user_id, domain_name, tld, enom_account, status,
            registration_date, expiration_date, auto_renew, lock_status,
            nameservers, last_synced_at, enom_mode
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)`,
          [
            userId,
            domain.domain_name,
            domain.tld,
            accountId,
            domainInfo.status || 'active',
            domainInfo.registration_date || null,
            domainInfo.expiration_date || null,
            domainInfo.auto_renew || false,
            domainInfo.lock_status !== false,
            JSON.stringify(domainInfo.nameservers || []),
            enom.env // Store current eNom mode
          ]
        );

        importedDomains.push({ ...domain, status: 'imported', contacts: domainInfo.contacts });
      } catch (domainError) {
        console.error(`Error importing domain ${domain.full_domain}:`, domainError.message);
        domainErrors.push({ domain: domain.full_domain, error: domainError.message });
      }
    }

    // If we created a new user and have domains, try to get address from WHOIS contacts
    if (userCreated && importedDomains.length > 0) {
      try {
        // Get contacts from the first imported domain
        const firstDomain = importedDomains[0];
        const contacts = await enom.getWhoisContacts(firstDomain.domain_name, firstDomain.tld);
        const registrant = contacts?.registrant;

        if (registrant) {
          console.log(`[SubAccount Import] Updating user address from registrant contact`);
          await pool.query(
            `UPDATE users SET
              full_name = COALESCE(NULLIF($1, ''), full_name),
              phone = COALESCE(NULLIF($2, ''), phone),
              company_name = COALESCE(NULLIF($3, ''), company_name),
              address_line1 = COALESCE(NULLIF($4, ''), address_line1),
              address_line2 = COALESCE(NULLIF($5, ''), address_line2),
              city = COALESCE(NULLIF($6, ''), city),
              state = COALESCE(NULLIF($7, ''), state),
              postal_code = COALESCE(NULLIF($8, ''), postal_code),
              country = COALESCE(NULLIF($9, ''), country),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $10`,
            [
              `${registrant.firstName || ''} ${registrant.lastName || ''}`.trim(),
              registrant.phone || null,
              registrant.organization || null,
              registrant.address1 || null,
              registrant.address2 || null,
              registrant.city || null,
              registrant.state || null,
              registrant.postalCode || null,
              registrant.country || null,
              userId
            ]
          );
        }
      } catch (contactError) {
        console.error('Error fetching contacts for address:', contactError.message);
        // Non-fatal - continue with import
      }
    }

    // Log the migration action
    await logAudit(pool, adminId, 'subaccount_import', 'user', userId, null, {
      subaccount_id: accountId,
      email: normalizedEmail,
      user_created: userCreated,
      domains_imported: importedDomains.length,
      errors: domainErrors
    }, req);

    res.json({
      success: true,
      message: userCreated ? 'Sub-account imported successfully' : 'Domains attached to existing user',
      user: {
        id: userId,
        username,
        email: normalizedEmail,
        created: userCreated
      },
      domains: {
        total: domains.length,
        imported: importedDomains.length,
        details: importedDomains,
        errors: domainErrors.length > 0 ? domainErrors : undefined
      }
    });
  } catch (error) {
    console.error('Sub-account import error:', error);
    res.status(500).json({ error: 'Failed to import sub-account: ' + error.message });
  }
});

// Get eNom balance
router.get('/enom/balance', async (req, res) => {
  try {
    const balance = await enom.getBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
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
      ON CONFLICT (domain_name, tld) DO UPDATE SET
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
    res.status(500).json({ error: 'Failed to import domain' });
  }
});

// Get pending transfers from eNom
router.get('/enom/transfers', async (req, res) => {
  try {
    const transfers = await enom.getPendingTransfers();
    res.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: 'Failed to fetch transfers' });
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
    res.status(500).json({ error: 'Failed to fetch transfer status' });
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
    res.status(500).json({ error: 'Failed to resend auth email' });
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
    res.status(500).json({ error: 'Failed to cancel transfer' });
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
    res.status(500).json({ error: 'Failed to check domain' });
  }
});

// Sync TLD pricing from eNom costs
router.post('/enom/sync-pricing', async (req, res) => {
  const pool = req.app.locals.pool;
  const { tlds, markup = 1.3, roundTo = 0.99 } = req.body;

  try {
    // If specific TLDs provided, use those; otherwise get from existing pricing table
    let tldsToSync = tlds;
    if (!tldsToSync || tldsToSync.length === 0) {
      const existingResult = await pool.query('SELECT tld FROM tld_pricing');
      tldsToSync = existingResult.rows.map(r => r.tld);
    }

    const results = [];
    const errors = [];

    for (const tld of tldsToSync) {
      try {
        // Get eNom reseller costs for this TLD
        const pricing = await enom.getTLDPricing(tld);

        if (pricing.cost_register > 0) {
          // Calculate retail prices with markup
          const calculatePrice = (cost) => {
            if (!cost || cost === 0) return 0;
            const withMarkup = cost * markup;
            // Round to .99 (e.g., 12.34 -> 12.99, 15.67 -> 15.99)
            return Math.floor(withMarkup) + roundTo;
          };

          const price_register = calculatePrice(pricing.cost_register);
          const price_renew = calculatePrice(pricing.cost_renew || pricing.cost_register);
          const price_transfer = calculatePrice(pricing.cost_transfer || pricing.cost_register);

          // Upsert pricing
          await pool.query(`
            INSERT INTO tld_pricing (tld, cost_register, cost_renew, cost_transfer, price_register, price_renew, price_transfer)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tld) DO UPDATE SET
              cost_register = EXCLUDED.cost_register,
              cost_renew = EXCLUDED.cost_renew,
              cost_transfer = EXCLUDED.cost_transfer,
              price_register = CASE WHEN tld_pricing.price_register = 0 OR tld_pricing.price_register IS NULL
                                    THEN EXCLUDED.price_register ELSE tld_pricing.price_register END,
              price_renew = CASE WHEN tld_pricing.price_renew = 0 OR tld_pricing.price_renew IS NULL
                                 THEN EXCLUDED.price_renew ELSE tld_pricing.price_renew END,
              price_transfer = CASE WHEN tld_pricing.price_transfer = 0 OR tld_pricing.price_transfer IS NULL
                                    THEN EXCLUDED.price_transfer ELSE tld_pricing.price_transfer END,
              updated_at = CURRENT_TIMESTAMP
          `, [tld, pricing.cost_register, pricing.cost_renew, pricing.cost_transfer, price_register, price_renew, price_transfer]);

          results.push({
            tld,
            cost_register: pricing.cost_register,
            cost_renew: pricing.cost_renew,
            cost_transfer: pricing.cost_transfer,
            price_register,
            price_renew,
            price_transfer
          });
        }
      } catch (err) {
        errors.push({ tld, error: err.message });
      }
    }

    res.json({
      message: 'Pricing sync completed',
      synced: results.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error syncing pricing:', error);
    res.status(500).json({ error: 'Failed to sync pricing' });
  }
});

// Get eNom cost for a specific TLD
router.get('/enom/pricing/:tld', async (req, res) => {
  const { tld } = req.params;

  try {
    const pricing = await enom.getTLDPricing(tld);
    res.json(pricing);
  } catch (error) {
    console.error('Error fetching eNom pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// Get list of all available TLDs from eNom
router.get('/enom/tlds', async (req, res) => {
  try {
    const tlds = await enom.getTLDList();
    res.json(tlds);
  } catch (error) {
    console.error('Error fetching TLD list:', error);
    res.status(500).json({ error: 'Failed to fetch TLD list' });
  }
});

module.exports = router;
