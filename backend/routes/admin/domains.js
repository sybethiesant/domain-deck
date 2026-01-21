/**
 * Admin Domain Management Routes
 * Domain listing, details, sync, and management
 */
const express = require('express');
const router = express.Router();
const { logAudit } = require('../../middleware/auth');
const enom = require('../../services/enom');

/**
 * Get the eNom mode for a domain
 * Operations will use the domain's recorded mode, not the global mode
 * @param {object} domain - Domain object with enom_mode property
 * @returns {string} The domain's eNom mode ('test' or 'production')
 */
function getDomainEnomMode(domain) {
  return domain.enom_mode || 'test';
}

// List all domains
router.get('/domains', async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    page = 1,
    limit = 50,
    status,
    expiring,
    search,
    tld,
    sort = 'expiration_date',
    order = 'asc'
  } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const allowedSorts = ['expiration_date', 'created_at', 'domain_name'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'expiration_date';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let query = `
      SELECT d.*, u.username, u.email
      FROM domains d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND d.status = $${params.length}`;
    }

    if (expiring === 'true') {
      query += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    } else if (expiring === '7') {
      query += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`;
    } else if (expiring === '90') {
      query += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`;
    } else if (expiring === 'expired') {
      query += ` AND d.expiration_date < CURRENT_DATE`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (d.domain_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    if (tld) {
      params.push(tld);
      query += ` AND d.tld = $${params.length}`;
    }

    query += ` ORDER BY d.${sortColumn} ${sortOrder} NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM domains d WHERE 1=1';
    const countParams = [];
    if (status) {
      countParams.push(status);
      countQuery += ` AND d.status = $${countParams.length}`;
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND d.domain_name ILIKE $${countParams.length}`;
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      domains: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Get domain details
router.get('/domains/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    const domainResult = await pool.query(
      `SELECT d.*, u.username, u.email, u.full_name
       FROM domains d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [domainId]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Get staff notes
    const notesResult = await pool.query(
      `SELECT sn.*, u.username as staff_username
       FROM staff_notes sn
       LEFT JOIN users u ON sn.staff_user_id = u.id
       WHERE sn.entity_type = 'domain' AND sn.entity_id = $1
       ORDER BY sn.is_pinned DESC, sn.created_at DESC`,
      [domainId]
    );

    // Get order history for this domain
    const ordersResult = await pool.query(
      `SELECT oi.*, o.order_number, o.status as order_status, o.created_at as order_date
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.domain_name = $1
       ORDER BY o.created_at DESC`,
      [domainResult.rows[0].domain_name]
    );

    // Get contacts if linked
    const contacts = {};
    const domain = domainResult.rows[0];
    if (domain.registrant_contact_id) {
      const contactResult = await pool.query('SELECT * FROM domain_contacts WHERE id = $1', [domain.registrant_contact_id]);
      contacts.registrant = contactResult.rows[0];
    }

    res.json({
      ...domain,
      notes: notesResult.rows,
      orderHistory: ordersResult.rows,
      contacts
    });
  } catch (error) {
    console.error('Error fetching domain details:', error);
    res.status(500).json({ error: 'Failed to fetch domain details' });
  }
});

// Helper to get app setting
async function getSetting(pool, key, defaultValue) {
  const result = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return result.rows.length > 0 ? result.rows[0].value : defaultValue;
}

// Update domain (transfer between users, update settings)
router.put('/domains/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { user_id, status, auto_renew, privacy_enabled } = req.body;

  try {
    const currentDomain = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (currentDomain.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const oldValues = {
      user_id: currentDomain.rows[0].user_id,
      status: currentDomain.rows[0].status,
      auto_renew: currentDomain.rows[0].auto_renew,
      privacy_enabled: currentDomain.rows[0].privacy_enabled
    };

    const domain = currentDomain.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;
    const domainMode = getDomainEnomMode(domain);

    // Handle suspension/unsuspension nameserver changes
    let nameserversUpdate = null;
    let suspendedOriginalNs = domain.suspended_original_ns;

    if (status === 'suspended' && domain.status !== 'suspended') {
      // Suspending: Save current nameservers and replace with suspended ones
      const suspendedNsSetting = await getSetting(pool, 'suspended_nameservers', 'ns1.suspended.worxtech.biz,ns2.suspended.worxtech.biz');
      const suspendedNs = suspendedNsSetting.split(',').map(ns => ns.trim());

      // Save current nameservers (stringify for JSONB storage)
      suspendedOriginalNs = JSON.stringify(domain.nameservers);

      // Update nameservers at eNom
      try {
        await enom.updateNameservers(sld, tld, suspendedNs, { mode: domainMode });
        nameserversUpdate = JSON.stringify(suspendedNs);
        console.log(`[Admin] Domain ${sld}.${tld} suspended - nameservers changed to suspended defaults`);
      } catch (enomError) {
        console.error('Failed to update nameservers for suspension:', enomError.message);
        // Continue with status change even if NS update fails
      }
    } else if (status && status !== 'suspended' && domain.status === 'suspended' && domain.suspended_original_ns) {
      // Unsuspending: Restore original nameservers
      try {
        const originalNs = typeof domain.suspended_original_ns === 'string'
          ? JSON.parse(domain.suspended_original_ns)
          : domain.suspended_original_ns;

        if (Array.isArray(originalNs) && originalNs.length >= 2) {
          await enom.updateNameservers(sld, tld, originalNs, { mode: domainMode });
          nameserversUpdate = JSON.stringify(originalNs);
          suspendedOriginalNs = null; // Clear saved NS
          console.log(`[Admin] Domain ${sld}.${tld} unsuspended - nameservers restored`);
        }
      } catch (enomError) {
        console.error('Failed to restore nameservers after unsuspension:', enomError.message);
      }
    }

    // If changing privacy, sync with eNom
    if (privacy_enabled !== undefined && privacy_enabled !== domain.privacy_enabled) {
      try {
        await enom.setWhoisPrivacy(sld, tld, privacy_enabled, { mode: domainMode });
      } catch (enomError) {
        console.error('eNom privacy sync failed:', enomError.message);
      }
    }

    const result = await pool.query(
      `UPDATE domains SET
        user_id = COALESCE($1, user_id),
        status = COALESCE($2, status),
        auto_renew = COALESCE($3, auto_renew),
        privacy_enabled = COALESCE($4, privacy_enabled),
        nameservers = COALESCE($6, nameservers),
        suspended_original_ns = $7,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [user_id, status, auto_renew, privacy_enabled, domainId, nameserversUpdate, suspendedOriginalNs]
    );

    await logAudit(pool, req.user.id, 'update_domain', 'domain', domainId, oldValues, { user_id, status, auto_renew, privacy_enabled }, req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating domain:', error);
    res.status(500).json({ error: 'Failed to update domain' });
  }
});

// Force sync domain with eNom
router.post('/domains/:id/sync', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get comprehensive info from eNom (using domain's recorded mode)
    const info = await enom.getFullDomainData(sld, tld, { mode: domainMode });
    const nameservers = info.nameservers;

    // Parse expiration date (format: MM/DD/YYYY or MM/DD/YYYY HH:MM:SS AM/PM)
    let expDate = null;
    if (info.expirationDate) {
      const expMatch = info.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (expMatch) {
        expDate = `${expMatch[3]}-${expMatch[1].padStart(2, '0')}-${expMatch[2].padStart(2, '0')}`;
      }
    }

    // Update domain
    const result = await pool.query(
      `UPDATE domains SET
        expiration_date = COALESCE($1, expiration_date),
        auto_renew = $2,
        privacy_enabled = $3,
        lock_status = $4,
        nameservers = $5,
        last_synced_at = CURRENT_TIMESTAMP,
        enom_status_raw = $6,
        status = CASE WHEN $1 < CURRENT_DATE THEN 'expired' ELSE 'active' END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        expDate,
        info.autoRenew,
        info.privacyEnabled,
        info.lockStatus,
        JSON.stringify(nameservers),
        JSON.stringify(info),
        domainId
      ]
    );

    res.json({
      success: true,
      domain: result.rows[0],
      enomInfo: info,
      nameservers
    });
  } catch (error) {
    console.error('Error syncing domain:', error);
    res.status(500).json({ error: 'Failed to sync domain' });
  }
});

// Bulk sync all domains
router.post('/domains/sync-all', async (req, res) => {
  const pool = req.app.locals.pool;
  const { limit = 100 } = req.body;

  try {
    // Get domains that need syncing (oldest sync first)
    const domainsResult = await pool.query(
      `SELECT id, domain_name, tld, enom_mode FROM domains
       WHERE status = 'active'
       ORDER BY last_synced_at ASC NULLS FIRST
       LIMIT $1`,
      [parseInt(limit)]
    );

    const results = { synced: 0, failed: 0, errors: [] };

    for (const domain of domainsResult.rows) {
      try {
        const sld = domain.domain_name;
        const tld = domain.tld;
        const domainMode = domain.enom_mode || 'test';

        const info = await enom.getFullDomainData(sld, tld, { mode: domainMode });
        const nameservers = info.nameservers;

        let expDate = null;
        if (info.expirationDate) {
          const expMatch = info.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (expMatch) {
            expDate = `${expMatch[3]}-${expMatch[1].padStart(2, '0')}-${expMatch[2].padStart(2, '0')}`;
          }
        }

        await pool.query(
          `UPDATE domains SET
            expiration_date = COALESCE($1, expiration_date),
            auto_renew = $2,
            privacy_enabled = $3,
            nameservers = $4,
            last_synced_at = CURRENT_TIMESTAMP,
            status = CASE WHEN $1 < CURRENT_DATE THEN 'expired' ELSE status END
           WHERE id = $5`,
          [expDate, info.autoRenew, info.privacyEnabled, JSON.stringify(nameservers), domain.id]
        );

        results.synced++;
      } catch (error) {
        results.failed++;
        results.errors.push({ domain: domain.domain_name, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Synced ${results.synced} domains, ${results.failed} failed`,
      ...results
    });
  } catch (error) {
    console.error('Error in bulk sync:', error);
    res.status(500).json({ error: 'Failed to sync domains' });
  }
});

// Get domain auth code (EPP code)
router.post('/domains/:id/auth-code', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const sld = domain.domain_name;
    const tld = domain.tld;

    const result = await enom.getAuthCode(sld, tld, { mode: domainMode });

    await logAudit(pool, req.user.id, 'get_auth_code', 'domain', domainId, null, null, req);

    res.json(result);
  } catch (error) {
    console.error('Error getting auth code:', error);
    res.status(500).json({ error: 'Failed to get auth code' });
  }
});

// Toggle auto-renew (dedicated endpoint for admin UI)
// Note: Auto-renewal is handled by our system's background jobs, NOT eNom's auto-renew.
// This flag controls whether our job scheduler will automatically renew expiring domains.
router.put('/domains/:id/autorenew', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { auto_renew } = req.body;

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];

    // Update database only - our system handles renewals, not eNom's auto-renew
    // Auto-renew flag is managed locally; actual renewals use domain's recorded mode
    await pool.query(
      'UPDATE domains SET auto_renew = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [auto_renew, domainId]
    );

    await logAudit(pool, req.user.id, auto_renew ? 'enable_autorenew' : 'disable_autorenew', 'domain', domainId,
      { auto_renew: domain.auto_renew }, { auto_renew }, req);

    res.json({ success: true, auto_renew });
  } catch (error) {
    console.error('Error setting auto-renew:', error);
    res.status(500).json({ error: 'Failed to set auto-renew' });
  }
});

// Toggle WHOIS privacy (dedicated endpoint for admin UI - bypasses payment check)
// Admin override: Can enable privacy without customer payment, but costs reseller money
router.put('/domains/:id/privacy', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { enabled, adminOverride } = req.body;

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const sld = domain.domain_name;
    const tld = domain.tld;

    // Check current privacy status at eNom first (using domain's recorded mode)
    let privacyStatus = { purchased: false, enabled: false };
    try {
      privacyStatus = await enom.getPrivacyStatus(sld, tld, { mode: domainMode });
    } catch (err) {
      console.log('Could not fetch privacy status, will attempt purchase if enabling');
    }

    let costIncurred = false;

    if (enabled) {
      // If privacy not purchased, we need to purchase it first
      if (!privacyStatus.purchased) {
        try {
          console.log(`[Admin] Purchasing ID Protect for ${sld}.${tld}`);
          await enom.purchasePrivacy(sld, tld, 1, { mode: domainMode });
          costIncurred = true;
          console.log(`[Admin] ID Protect purchased successfully for ${sld}.${tld}`);

          // Purchase typically auto-enables, verify status
          try {
            const newStatus = await enom.getPrivacyStatus(sld, tld, { mode: domainMode });
            if (newStatus.enabled) {
              console.log(`[Admin] Privacy already enabled after purchase for ${sld}.${tld}`);
              // Skip the enable call since it's already active
            } else {
              // Not auto-enabled, try to enable
              await enom.setWhoisPrivacy(sld, tld, true, { mode: domainMode });
            }
          } catch (statusErr) {
            // If we can't check status, try enabling anyway but don't fail if it errors
            try {
              await enom.setWhoisPrivacy(sld, tld, true, { mode: domainMode });
            } catch (enableErr) {
              console.log(`[Admin] Enable after purchase failed (may already be active): ${enableErr.message}`);
            }
          }
        } catch (purchaseError) {
          console.error('eNom privacy purchase failed:', purchaseError.message);
          return res.status(500).json({
            error: 'Failed to purchase privacy at eNom: ' + purchaseError.message,
            hint: 'ID Protect must be purchased before it can be enabled'
          });
        }
      } else if (!privacyStatus.enabled) {
        // Already purchased but not enabled - just enable it
        try {
          await enom.setWhoisPrivacy(sld, tld, true, { mode: domainMode });
        } catch (enomError) {
          console.error('eNom privacy enable failed:', enomError.message);
          return res.status(500).json({ error: 'Failed to enable privacy at eNom: ' + enomError.message });
        }
      }
      // If already purchased and enabled, nothing to do
    } else {
      // Disabling privacy - just turn it off (doesn't cost anything)
      try {
        await enom.setWhoisPrivacy(sld, tld, false, { mode: domainMode });
      } catch (enomError) {
        console.error('eNom privacy disable failed:', enomError.message);
        return res.status(500).json({ error: 'Failed to disable privacy at eNom: ' + enomError.message });
      }
    }

    // Update database
    await pool.query(
      'UPDATE domains SET privacy_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [enabled, domainId]
    );

    await logAudit(pool, req.user.id, enabled ? 'enable_privacy_admin' : 'disable_privacy_admin', 'domain', domainId,
      { privacy_enabled: domain.privacy_enabled, adminOverride: !!adminOverride, purchased: costIncurred },
      { privacy_enabled: enabled }, req);

    res.json({
      success: true,
      privacy_enabled: enabled,
      costIncurred,
      purchased: costIncurred,
      message: costIncurred ? 'ID Protect purchased and enabled - charged to reseller account' : undefined
    });
  } catch (error) {
    console.error('Error setting privacy:', error);
    res.status(500).json({ error: 'Failed to set privacy' });
  }
});

// Update nameservers (dedicated endpoint for admin UI)
router.put('/domains/:id/nameservers', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { nameservers } = req.body;

  try {
    if (!nameservers || !Array.isArray(nameservers) || nameservers.length < 2) {
      return res.status(400).json({ error: 'At least 2 nameservers are required' });
    }

    // Validate nameserver format
    const nsPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
    for (const ns of nameservers) {
      if (!nsPattern.test(ns)) {
        return res.status(400).json({ error: `Invalid nameserver format: ${ns}` });
      }
    }

    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const sld = domain.domain_name;
    const tld = domain.tld;

    // Update at eNom (using domain's recorded mode)
    try {
      await enom.updateNameservers(sld, tld, nameservers, { mode: domainMode });
    } catch (enomError) {
      console.error('eNom nameserver update failed:', enomError.message);
      return res.status(500).json({ error: 'Failed to update nameservers at eNom: ' + enomError.message });
    }

    // Update database
    await pool.query(
      'UPDATE domains SET nameservers = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(nameservers), domainId]
    );

    await logAudit(pool, req.user.id, 'update_nameservers', 'domain', domainId,
      { nameservers: domain.nameservers }, { nameservers: JSON.stringify(nameservers) }, req);

    res.json({ success: true, nameservers });
  } catch (error) {
    console.error('Error updating nameservers:', error);
    res.status(500).json({ error: 'Failed to update nameservers' });
  }
});

// Lock/unlock domain
router.post('/domains/:id/lock', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { lock } = req.body;

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const sld = domain.domain_name;
    const tld = domain.tld;

    await enom.setDomainLock(sld, tld, lock, { mode: domainMode });

    await pool.query(
      'UPDATE domains SET lock_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [lock, domainId]
    );

    await logAudit(pool, req.user.id, lock ? 'lock_domain' : 'unlock_domain', 'domain', domainId, null, { lock }, req);

    res.json({ success: true, locked: lock });
  } catch (error) {
    console.error('Error setting domain lock:', error);
    res.status(500).json({ error: 'Failed to set domain lock' });
  }
});

module.exports = router;
