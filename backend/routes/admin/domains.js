/**
 * Admin Domain Management Routes
 * Domain listing, details, sync, and management
 */
const express = require('express');
const router = express.Router();
const { logAudit } = require('../../middleware/auth');
const enom = require('../../services/enom');

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

    // If changing auto_renew or privacy, sync with eNom
    const domain = currentDomain.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    if (auto_renew !== undefined && auto_renew !== domain.auto_renew) {
      try {
        await enom.setAutoRenew(sld, tld, auto_renew);
      } catch (enomError) {
        console.error('eNom auto-renew sync failed:', enomError.message);
        // Continue anyway, update local DB
      }
    }

    if (privacy_enabled !== undefined && privacy_enabled !== domain.privacy_enabled) {
      try {
        await enom.setWhoisPrivacy(sld, tld, privacy_enabled);
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
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [user_id, status, auto_renew, privacy_enabled, domainId]
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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Get info from eNom
    const [info, nameservers] = await Promise.all([
      enom.getDomainInfo(sld, tld),
      enom.getNameservers(sld, tld)
    ]);

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
        info.whoisPrivacy,
        info.lockStatus === 'locked',
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
      `SELECT id, domain_name FROM domains
       WHERE status = 'active'
       ORDER BY last_synced_at ASC NULLS FIRST
       LIMIT $1`,
      [parseInt(limit)]
    );

    const results = { synced: 0, failed: 0, errors: [] };

    for (const domain of domainsResult.rows) {
      try {
        const parts = domain.domain_name.split('.');
        const tld = parts.pop();
        const sld = parts.join('.');

        const info = await enom.getDomainInfo(sld, tld);
        const nameservers = await enom.getNameservers(sld, tld);

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
          [expDate, info.autoRenew, info.whoisPrivacy, JSON.stringify(nameservers), domain.id]
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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    const result = await enom.getAuthCode(sld, tld);

    await logAudit(pool, req.user.id, 'get_auth_code', 'domain', domainId, null, null, req);

    res.json(result);
  } catch (error) {
    console.error('Error getting auth code:', error);
    res.status(500).json({ error: 'Failed to get auth code' });
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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    await enom.setDomainLock(sld, tld, lock);

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
