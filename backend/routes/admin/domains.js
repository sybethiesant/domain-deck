/**
 * Admin Domain Management Routes
 * Domain listing, details, sync, and management
 *
 * Access Levels:
 * - Level 1+: View domains and details
 * - Level 3+: Edit domains, sync, manage settings
 */
const express = require('express');
const router = express.Router();
const { logAudit, ROLE_LEVELS } = require('../../middleware/auth');
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

    // Get total count (must match main query filters exactly)
    let countQuery = `
      SELECT COUNT(*) FROM domains d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];

    if (status) {
      countParams.push(status);
      countQuery += ` AND d.status = $${countParams.length}`;
    }

    if (expiring === 'true') {
      countQuery += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    } else if (expiring === '7') {
      countQuery += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`;
    } else if (expiring === '90') {
      countQuery += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`;
    } else if (expiring === 'expired') {
      countQuery += ` AND d.expiration_date < CURRENT_DATE`;
    }

    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (d.domain_name ILIKE $${countParams.length} OR u.email ILIKE $${countParams.length})`;
    }

    if (tld) {
      countParams.push(tld);
      countQuery += ` AND d.tld = $${countParams.length}`;
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

// Helper to check if user has admin level (3+)
function requireAdminLevel(req, res) {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

// Update domain (transfer between users, update settings)
// Requires level 3+ (Admin)
router.put('/domains/:id', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;

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
      const suspendedNsSetting = await getSetting(pool, 'suspended_nameservers', 'ns1.suspended.example.com,ns2.suspended.example.com');
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

// Get WHOIS contacts for domain (admin - no ownership check)
router.get('/domains/:id/contacts', async (req, res) => {
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

    // Get contacts from eNom
    const contacts = await enom.getWhoisContacts(sld, tld, { mode: domainMode });

    res.json({
      domain: `${sld}.${tld}`,
      domain_id: domainId,
      ...contacts
    });
  } catch (error) {
    console.error('Error getting domain contacts:', error);
    res.status(500).json({ error: 'Failed to get contacts: ' + error.message });
  }
});

// Update WHOIS contacts for domain (admin - no ownership check)
// Requires level 3+ (Admin)
router.put('/domains/:id/contacts', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { registrant, admin, tech, billing } = req.body;

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const domainMode = getDomainEnomMode(domain);
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get current contacts first (for partial update support)
    const currentContacts = await enom.getWhoisContacts(sld, tld, { mode: domainMode });

    // Helper to normalize contact format for eNom API
    const normalizeContact = (contact) => {
      if (!contact) return null;
      return {
        firstName: contact.firstName || contact.first_name,
        lastName: contact.lastName || contact.last_name,
        organization: contact.organization || contact.company || '',
        email: contact.email || contact.emailAddress,
        phone: contact.phone,
        address1: contact.address1 || contact.address_line1,
        address2: contact.address2 || contact.address_line2 || '',
        city: contact.city,
        state: contact.state || contact.stateProvince,
        postalCode: contact.postalCode || contact.postal_code,
        country: contact.country || 'US'
      };
    };

    // Merge provided contacts with current contacts
    const updatedContacts = {
      registrant: registrant ? normalizeContact(registrant) : normalizeContact(currentContacts.registrant),
      admin: admin ? normalizeContact(admin) : normalizeContact(currentContacts.admin),
      tech: tech ? normalizeContact(tech) : normalizeContact(currentContacts.tech),
      billing: billing ? normalizeContact(billing) : normalizeContact(currentContacts.billing)
    };

    // Update contacts via eNom
    await enom.updateContacts(sld, tld, updatedContacts, { mode: domainMode });

    await logAudit(pool, req.user.id, 'update_contacts', 'domain', domainId, null, { contacts: Object.keys(req.body) }, req);

    res.json({
      success: true,
      domain: `${sld}.${tld}`,
      message: 'Contacts updated successfully'
    });
  } catch (error) {
    console.error('Error updating domain contacts:', error);
    res.status(500).json({ error: 'Failed to update contacts: ' + error.message });
  }
});

// Force sync domain with eNom
// Requires level 3+ (Admin)
router.post('/domains/:id/sync', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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
// Requires level 3+ (Admin)
router.post('/domains/sync-all', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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
// Requires level 3+ (Admin)
router.post('/domains/:id/auth-code', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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
// Requires level 3+ (Admin)
router.put('/domains/:id/autorenew', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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
// Requires level 3+ (Admin)
router.put('/domains/:id/privacy', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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
// Requires level 3+ (Admin)
router.put('/domains/:id/nameservers', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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
// Requires level 3+ (Admin)
router.post('/domains/:id/lock', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
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

// ============================================
// ADMIN DNS HOST RECORD MANAGEMENT
// ============================================

// Get DNS records for any domain (admin)
router.get('/domains/:id/dns', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const records = await enom.getHostRecords(domain.domain_name, domain.tld, { mode: domainMode });
    res.json(records);
  } catch (error) {
    console.error('Error getting DNS records:', error);
    res.status(500).json({ error: 'Failed to get DNS records' });
  }
});

// Set all DNS records for any domain (admin)
// Requires level 3+ (Admin)
router.put('/domains/:id/dns', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { records } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records array is required' });
  }

  try {
    const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const setResult = await enom.setHostRecords(domain.domain_name, domain.tld, records, { mode: domainMode });

    await logAudit(pool, req.user.id, 'update_dns', 'domain', domainId, null, { recordCount: records.length }, req);

    res.json(setResult);
  } catch (error) {
    console.error('Error setting DNS records:', error);
    res.status(500).json({ error: error.message || 'Failed to set DNS records' });
  }
});

// Add DNS record for any domain (admin)
// Requires level 3+ (Admin)
router.post('/domains/:id/dns', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { hostName, recordType, address, mxPref } = req.body;

  if (!recordType || !address) {
    return res.status(400).json({ error: 'recordType and address are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const addResult = await enom.addHostRecord(domain.domain_name, domain.tld, {
      hostName: hostName || '@',
      recordType,
      address,
      mxPref
    }, { mode: domainMode });

    await logAudit(pool, req.user.id, 'add_dns_record', 'domain', domainId, null, { hostName, recordType, address }, req);

    res.json(addResult);
  } catch (error) {
    console.error('Error adding DNS record:', error);
    res.status(500).json({ error: error.message || 'Failed to add DNS record' });
  }
});

// Delete DNS record for any domain (admin)
// Requires level 3+ (Admin)
router.delete('/domains/:id/dns/:recordIndex', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const recordIndex = parseInt(req.params.recordIndex);

  try {
    const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const deleteResult = await enom.deleteHostRecord(domain.domain_name, domain.tld, recordIndex, { mode: domainMode });

    await logAudit(pool, req.user.id, 'delete_dns_record', 'domain', domainId, null, { recordIndex }, req);

    res.json(deleteResult);
  } catch (error) {
    console.error('Error deleting DNS record:', error);
    res.status(500).json({ error: error.message || 'Failed to delete DNS record' });
  }
});

// Update URL forwarding for any domain (admin)
// Requires level 3+ (Admin)
router.put('/domains/:id/url-forwarding', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { forwardUrl, forwardType, cloak, cloakTitle } = req.body;

  if (!forwardUrl) {
    return res.status(400).json({ error: 'forwardUrl is required' });
  }

  try {
    const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const setResult = await enom.setUrlForwarding(domain.domain_name, domain.tld, {
      forwardUrl,
      forwardType: forwardType || 'temporary',
      cloak: cloak || false,
      cloakTitle
    }, { mode: domainMode });

    await logAudit(pool, req.user.id, 'set_url_forwarding', 'domain', domainId, null, { forwardUrl, forwardType }, req);

    res.json(setResult);
  } catch (error) {
    console.error('Error setting URL forwarding:', error);
    res.status(500).json({ error: error.message || 'Failed to set URL forwarding' });
  }
});

// Disable URL forwarding for any domain (admin)
// Requires level 3+ (Admin)
router.delete('/domains/:id/url-forwarding', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];
    const domainMode = getDomainEnomMode(domain);

    const deleteResult = await enom.disableUrlForwarding(domain.domain_name, domain.tld, { mode: domainMode });

    await logAudit(pool, req.user.id, 'disable_url_forwarding', 'domain', domainId, null, null, req);

    res.json(deleteResult);
  } catch (error) {
    console.error('Error disabling URL forwarding:', error);
    res.status(500).json({ error: error.message || 'Failed to disable URL forwarding' });
  }
});

// Admin: Push domain to another user (immediate transfer, no acceptance needed)
// Requires level 3+ (Admin)
router.post('/domains/:id/push', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { to_email, notes } = req.body;

  if (!to_email) {
    return res.status(400).json({ error: 'Recipient email is required' });
  }

  try {
    // Get domain
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const previousOwnerId = domain.user_id;

    // Find recipient user
    const recipientResult = await pool.query(
      'SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER($1)',
      [to_email.trim()]
    );

    if (recipientResult.rows.length === 0) {
      return res.status(404).json({ error: 'No user found with that email address' });
    }

    const recipient = recipientResult.rows[0];

    if (recipient.id === previousOwnerId) {
      return res.status(400).json({ error: 'User already owns this domain' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create a completed push record for history
      await client.query(`
        INSERT INTO domain_push_requests
          (domain_id, from_user_id, to_user_id, to_email, notes, initiated_by_admin, status, responded_at)
        VALUES ($1, $2, $3, $4, $5, true, 'accepted', CURRENT_TIMESTAMP)
      `, [domainId, previousOwnerId, recipient.id, recipient.email, notes || 'Admin transfer']);

      // Transfer domain ownership
      await client.query(`
        UPDATE domains
        SET user_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [recipient.id, domainId]);

      await client.query('COMMIT');

      // Audit log
      await logAudit(pool, req.user.id, 'admin_push_domain', 'domain', domainId,
        { previous_owner_id: previousOwnerId },
        { new_owner_id: recipient.id, to_email: recipient.email }, req);

      res.json({
        success: true,
        message: `Domain ${domain.domain_name}.${domain.tld} transferred to ${recipient.email}`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error pushing domain:', error);
    res.status(500).json({ error: 'Failed to push domain' });
  }
});

// ========== PUSH REQUEST MANAGEMENT ==========

// Get all pending push requests (admin view)
router.get('/push-requests', async (req, res) => {
  const pool = req.app.locals.pool;
  const { status = 'pending', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const validStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'expired', 'all'];
    const filterStatus = validStatuses.includes(status) ? status : 'pending';

    let whereClause = filterStatus === 'all' ? '' : 'WHERE dpr.status = $1';
    const params = filterStatus === 'all' ? [] : [filterStatus];

    const result = await pool.query(`
      SELECT
        dpr.*,
        d.domain_name, d.tld,
        fu.email as from_email, fu.full_name as from_name,
        tu.email as to_email, tu.full_name as to_name
      FROM domain_push_requests dpr
      JOIN domains d ON d.id = dpr.domain_id
      JOIN users fu ON fu.id = dpr.from_user_id
      JOIN users tu ON tu.id = dpr.to_user_id
      ${whereClause}
      ORDER BY dpr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM domain_push_requests dpr
      ${whereClause}
    `, params);

    res.json({
      requests: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching push requests:', error);
    res.status(500).json({ error: 'Failed to fetch push requests' });
  }
});

// Admin: Expire a pending push request
// Requires level 3+ (Admin)
router.post('/push-requests/:id/expire', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;
  const pool = req.app.locals.pool;
  const requestId = parseInt(req.params.id);

  try {
    const result = await pool.query(`
      UPDATE domain_push_requests
      SET status = 'expired', responded_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `, [requestId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending push request not found' });
    }

    await logAudit(pool, req.user.id, 'admin_expire_push', 'push_request', requestId,
      { status: 'pending' }, { status: 'expired' }, req);

    res.json({ success: true, message: 'Push request expired', request: result.rows[0] });
  } catch (error) {
    console.error('Error expiring push request:', error);
    res.status(500).json({ error: 'Failed to expire push request' });
  }
});

module.exports = router;
