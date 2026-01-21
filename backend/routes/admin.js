const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware, requireRole, logAudit, ROLE_LEVELS } = require('../middleware/auth');
const enom = require('../services/enom');
const emailService = require('../services/email');

// All admin routes require auth and admin status
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard statistics
router.get('/stats', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const stats = {};

    // Total users
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    stats.totalUsers = parseInt(usersResult.rows[0].count);

    // Total domains
    const domainsResult = await pool.query('SELECT COUNT(*) FROM domains');
    stats.totalDomains = parseInt(domainsResult.rows[0].count);

    // Active domains
    const activeDomainsResult = await pool.query(
      "SELECT COUNT(*) FROM domains WHERE status = 'active'"
    );
    stats.activeDomains = parseInt(activeDomainsResult.rows[0].count);

    // Total orders
    const ordersResult = await pool.query('SELECT COUNT(*) FROM orders');
    stats.totalOrders = parseInt(ordersResult.rows[0].count);

    // Revenue (completed orders)
    const revenueResult = await pool.query(
      "SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE payment_status = 'paid'"
    );
    stats.totalRevenue = parseFloat(revenueResult.rows[0].revenue);

    // Orders today
    const todayOrdersResult = await pool.query(
      "SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE"
    );
    stats.ordersToday = parseInt(todayOrdersResult.rows[0].count);

    // Revenue today
    const todayRevenueResult = await pool.query(
      `SELECT COALESCE(SUM(total), 0) as revenue FROM orders
       WHERE created_at >= CURRENT_DATE AND payment_status = 'paid'`
    );
    stats.revenueToday = parseFloat(todayRevenueResult.rows[0].revenue);

    // Expiring soon (next 30 days)
    const expiringSoonResult = await pool.query(
      `SELECT COUNT(*) FROM domains
       WHERE expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`
    );
    stats.expiringSoon = parseInt(expiringSoonResult.rows[0].count);

    // Pending orders
    const pendingOrdersResult = await pool.query(
      "SELECT COUNT(*) FROM orders WHERE status = 'pending'"
    );
    stats.pendingOrders = parseInt(pendingOrdersResult.rows[0].count);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// List all users
router.get('/users', async (req, res) => {
  const pool = req.app.locals.pool;
  const { search } = req.query;
  // Validate pagination parameters
  const page = Math.max(1, Math.min(parseInt(req.query.page) || 1, 10000));
  const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 100));
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.is_admin,
             u.role_level, u.role_name, u.created_at, u.last_login_at,
             COUNT(DISTINCT d.id) as domain_count,
             COUNT(DISTINCT o.id) as order_count
      FROM users u
      LEFT JOIN domains d ON u.id = d.user_id
      LEFT JOIN orders o ON u.id = o.user_id
    `;
    const params = [];

    if (search) {
      query += ` WHERE u.username ILIKE $1 OR u.email ILIKE $1 OR u.full_name ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    const countQuery = search
      ? `SELECT COUNT(*) FROM users WHERE username ILIKE $1 OR email ILIKE $1 OR full_name ILIKE $1`
      : 'SELECT COUNT(*) FROM users';
    const countParams = search ? [`%${search}%`] : [];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user details
router.get('/users/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);

  try {
    const userResult = await pool.query(
      `SELECT id, username, email, full_name, phone, company_name,
              address_line1, address_line2, city, state, postal_code, country,
              is_admin, created_at, last_login_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's domains
    const domainsResult = await pool.query(
      'SELECT id, domain_name, status, expiration_date FROM domains WHERE user_id = $1',
      [userId]
    );

    // Get user's orders
    const ordersResult = await pool.query(
      `SELECT id, order_number, status, total, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    res.json({
      ...userResult.rows[0],
      domains: domainsResult.rows,
      recentOrders: ordersResult.rows
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user (admin toggle and role management)
router.put('/users/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { is_admin, role_level, role_name } = req.body;

  try {
    // Get current user data for audit
    const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldValues = {
      is_admin: currentUser.rows[0].is_admin,
      role_level: currentUser.rows[0].role_level,
      role_name: currentUser.rows[0].role_name
    };

    // Check if trying to set a role higher than own role
    if (role_level !== undefined && role_level > req.user.role_level) {
      return res.status(403).json({ error: 'Cannot assign role higher than your own' });
    }

    // Only superadmins (role_level 4+) can grant is_admin status
    if (is_admin === true && req.user.role_level < ROLE_LEVELS.SUPERADMIN) {
      return res.status(403).json({ error: 'Only superadmins can grant admin status' });
    }

    const result = await pool.query(
      `UPDATE users SET
        is_admin = COALESCE($1, is_admin),
        role_level = COALESCE($2, role_level),
        role_name = COALESCE($3, role_name),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, username, email, is_admin, role_level, role_name`,
      [is_admin, role_level, role_name, userId]
    );

    // Log the audit
    await logAudit(pool, req.user.id, 'update_user_role', 'user', userId, oldValues, result.rows[0], req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Get available roles (for dropdown in admin panel)
router.get('/roles', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Only show roles up to and including the current user's level
    const result = await pool.query(
      `SELECT * FROM roles WHERE level <= $1 ORDER BY level`,
      [req.user.role_level]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get order details
router.get('/orders/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseInt(req.params.id);

  try {
    // Get order with user info
    const orderResult = await pool.query(
      `SELECT o.*, u.username, u.email, u.full_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT oi.*, d.status as domain_status
       FROM order_items oi
       LEFT JOIN domains d ON oi.domain_id = d.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    // Get staff notes
    const notesResult = await pool.query(
      `SELECT sn.*, u.username as staff_username
       FROM staff_notes sn
       LEFT JOIN users u ON sn.staff_user_id = u.id
       WHERE sn.entity_type = 'order' AND sn.entity_id = $1
       ORDER BY sn.is_pinned DESC, sn.created_at DESC`,
      [orderId]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
      notes: notesResult.rows
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Update order status
router.put('/orders/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseInt(req.params.id);
  const { status, payment_status, notes } = req.body;

  try {
    const currentOrder = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (currentOrder.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const oldValues = { status: currentOrder.rows[0].status, payment_status: currentOrder.rows[0].payment_status };

    const result = await pool.query(
      `UPDATE orders SET
        status = COALESCE($1, status),
        payment_status = COALESCE($2, payment_status),
        notes = COALESCE($3, notes),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, payment_status, notes, orderId]
    );

    await logAudit(pool, req.user.id, 'update_order', 'order', orderId, oldValues, { status, payment_status }, req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Retry failed registration for an order item
router.post('/orders/:orderId/items/:itemId/retry', async (req, res) => {
  const pool = req.app.locals.pool;
  const { orderId, itemId } = req.params;

  try {
    // Get the order item
    const itemResult = await pool.query(
      `SELECT oi.*, o.user_id FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1 AND oi.order_id = $2`,
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    const item = itemResult.rows[0];

    if (item.status !== 'failed') {
      return res.status(400).json({ error: 'Can only retry failed items' });
    }

    // Get user's default contact
    const contactResult = await pool.query(
      `SELECT * FROM domain_contacts WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [item.user_id]
    );

    const contact = contactResult.rows[0];
    if (!contact) {
      return res.status(400).json({ error: 'User has no default contact set' });
    }

    // Parse domain
    const parts = item.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    let result;
    if (item.item_type === 'register') {
      result = await enom.registerDomain({
        sld,
        tld,
        years: item.years,
        registrant: contact
      });
    } else if (item.item_type === 'renew') {
      result = await enom.renewDomain(sld, tld, item.years);
    }

    // Update the order item
    await pool.query(
      `UPDATE order_items SET
        status = 'completed',
        enom_order_id = $1,
        enom_status = 'success',
        processed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [result.orderId, itemId]
    );

    await logAudit(pool, req.user.id, 'retry_registration', 'order_item', itemId, { status: 'failed' }, { status: 'completed' }, req);

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error retrying registration:', error);
    res.status(500).json({ error: 'Failed to retry registration' });
  }
});

// Get audit logs (super admin only)
router.get('/audit-logs', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 100, user_id, action, entity_type, start_date, end_date } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT al.*, u.username, u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      params.push(parseInt(user_id));
      query += ` AND al.user_id = $${params.length}`;
    }

    if (action) {
      params.push(action);
      query += ` AND al.action = $${params.length}`;
    }

    if (entity_type) {
      params.push(entity_type);
      query += ` AND al.entity_type = $${params.length}`;
    }

    if (start_date) {
      params.push(start_date);
      query += ` AND al.created_at >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND al.created_at <= $${params.length}`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM audit_logs WHERE 1=1';
    const countParams = [];
    if (user_id) {
      countParams.push(parseInt(user_id));
      countQuery += ` AND user_id = $${countParams.length}`;
    }
    if (action) {
      countParams.push(action);
      countQuery += ` AND action = $${countParams.length}`;
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get system settings
router.get('/settings', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query('SELECT * FROM app_settings ORDER BY key');
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update system settings (super admin only)
router.put('/settings', async (req, res) => {
  const pool = req.app.locals.pool;

  // Require super admin for settings
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const settings = req.body;
    const updated = [];

    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
      updated.push(key);
    }

    await logAudit(pool, req.user.id, 'update_settings', 'app_settings', null, null, settings, req);

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
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

    res.json({
      ...domainResult.rows[0],
      notes: notesResult.rows,
      orderHistory: ordersResult.rows
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

    const oldValues = { user_id: currentDomain.rows[0].user_id, status: currentDomain.rows[0].status };

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

    await logAudit(pool, req.user.id, 'update_domain', 'domain', domainId, oldValues, { user_id, status }, req);

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
    const info = await enom.getDomainInfo(sld, tld);
    const nameservers = await enom.getNameservers(sld, tld);

    // Parse expiration date
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
        expiration_date = $1,
        auto_renew = $2,
        privacy_enabled = $3,
        lock_status = $4,
        nameservers = $5,
        last_synced_at = CURRENT_TIMESTAMP,
        enom_status_raw = $6,
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

// Get domain auth code (for transfers)
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

    // Get auth code from eNom
    const authCode = await enom.getAuthCode(sld, tld);

    await logAudit(pool, req.user.id, 'get_auth_code', 'domain', domainId, null, { domain: domain.domain_name }, req);

    res.json({ authCode, domain: domain.domain_name });
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

    // Lock/unlock at eNom
    await enom.setDomainLock(sld, tld, lock);

    // Update local database
    await pool.query(
      'UPDATE domains SET lock_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [lock, domainId]
    );

    await logAudit(pool, req.user.id, lock ? 'lock_domain' : 'unlock_domain', 'domain', domainId, { lock_status: !lock }, { lock_status: lock }, req);

    res.json({ success: true, locked: lock, domain: domain.domain_name });
  } catch (error) {
    console.error('Error toggling domain lock:', error);
    res.status(500).json({ error: 'Failed to update domain lock' });
  }
});

// Admin: Toggle WHOIS privacy (bypasses payment check)
router.put('/domains/:id/privacy', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { enabled } = req.body;

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Update at eNom (admin bypass - no payment check)
    await enom.setWhoisPrivacy(sld, tld, !!enabled);

    // Update local database
    const result = await pool.query(
      'UPDATE domains SET privacy_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [!!enabled, domainId]
    );

    await logAudit(pool, req.user.id, enabled ? 'enable_privacy' : 'disable_privacy', 'domain', domainId,
      { privacy_enabled: !enabled }, { privacy_enabled: enabled }, req);

    res.json({ success: true, privacy_enabled: enabled, domain: domain.domain_name });
  } catch (error) {
    console.error('Error toggling privacy:', error);
    res.status(500).json({ error: 'Failed to update privacy' });
  }
});

// Admin: Toggle auto-renew
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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Update at eNom
    await enom.setAutoRenew(sld, tld, !!auto_renew);

    // Update local database
    const result = await pool.query(
      'UPDATE domains SET auto_renew = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [!!auto_renew, domainId]
    );

    await logAudit(pool, req.user.id, auto_renew ? 'enable_autorenew' : 'disable_autorenew', 'domain', domainId,
      { auto_renew: !auto_renew }, { auto_renew: auto_renew }, req);

    res.json({ success: true, auto_renew: auto_renew, domain: domain.domain_name });
  } catch (error) {
    console.error('Error toggling auto-renew:', error);
    res.status(500).json({ error: 'Failed to update auto-renew' });
  }
});

// Admin: Update nameservers
router.put('/domains/:id/nameservers', async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { nameservers } = req.body;

  if (!nameservers || !Array.isArray(nameservers) || nameservers.length < 2) {
    return res.status(400).json({ error: 'At least 2 nameservers required' });
  }

  try {
    const domainResult = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Update at eNom
    await enom.updateNameservers(sld, tld, nameservers);

    // Update local database
    const result = await pool.query(
      'UPDATE domains SET nameservers = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [JSON.stringify(nameservers), domainId]
    );

    await logAudit(pool, req.user.id, 'update_nameservers', 'domain', domainId,
      { nameservers: domain.nameservers }, { nameservers }, req);

    res.json({ success: true, nameservers, domain: domain.domain_name });
  } catch (error) {
    console.error('Error updating nameservers:', error);
    res.status(500).json({ error: 'Failed to update nameservers' });
  }
});

// List all orders
router.get('/orders', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 50, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT o.*, u.username, u.email,
             COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    const params = [];

    if (status) {
      query += ` WHERE o.status = $1`;
      params.push(status);
    }

    query += ` GROUP BY o.id, u.username, u.email ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    const countQuery = status
      ? 'SELECT COUNT(*) FROM orders WHERE status = $1'
      : 'SELECT COUNT(*) FROM orders';
    const countParams = status ? [status] : [];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// List all domains (with advanced filters)
router.get('/domains', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 50, status, expiring, search, tld } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT d.*, u.username, u.email
      FROM domains d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Search filter (domain name or owner)
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (d.domain_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    // Status filter
    if (status) {
      params.push(status);
      query += ` AND d.status = $${params.length}`;
    }

    // TLD filter
    if (tld) {
      params.push(tld.toLowerCase().replace('.', ''));
      query += ` AND d.tld = $${params.length}`;
    }

    // Expiring filter
    if (expiring === 'true' || expiring === '30') {
      query += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    } else if (expiring === '7') {
      query += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`;
    } else if (expiring === '90') {
      query += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`;
    } else if (expiring === 'expired') {
      query += ` AND d.expiration_date < CURRENT_DATE`;
    }

    query += ` ORDER BY d.expiration_date ASC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count with same filters
    let countQuery = `
      SELECT COUNT(*) FROM domains d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE 1=1
    `;
    const countParams = [];

    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (d.domain_name ILIKE $${countParams.length} OR u.username ILIKE $${countParams.length} OR u.email ILIKE $${countParams.length})`;
    }
    if (status) {
      countParams.push(status);
      countQuery += ` AND d.status = $${countParams.length}`;
    }
    if (tld) {
      countParams.push(tld.toLowerCase().replace('.', ''));
      countQuery += ` AND d.tld = $${countParams.length}`;
    }
    if (expiring === 'true' || expiring === '30') {
      countQuery += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
    } else if (expiring === '7') {
      countQuery += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`;
    } else if (expiring === '90') {
      countQuery += ` AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`;
    } else if (expiring === 'expired') {
      countQuery += ` AND d.expiration_date < CURRENT_DATE`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      domains: result.rows,
      page: parseInt(page),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Update TLD pricing
router.put('/pricing/:tld', async (req, res) => {
  const pool = req.app.locals.pool;
  const { tld } = req.params;
  const {
    cost_register, cost_renew, cost_transfer,
    price_register, price_renew, price_transfer,
    price_privacy, is_active
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE tld_pricing SET
        cost_register = COALESCE($1, cost_register),
        cost_renew = COALESCE($2, cost_renew),
        cost_transfer = COALESCE($3, cost_transfer),
        price_register = COALESCE($4, price_register),
        price_renew = COALESCE($5, price_renew),
        price_transfer = COALESCE($6, price_transfer),
        price_privacy = COALESCE($7, price_privacy),
        is_active = COALESCE($8, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE tld = $9
       RETURNING *`,
      [
        cost_register, cost_renew, cost_transfer,
        price_register, price_renew, price_transfer,
        price_privacy, is_active, tld.toLowerCase()
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'TLD not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// Get all TLD pricing (including costs)
router.get('/pricing', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      'SELECT * FROM tld_pricing ORDER BY tld'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// Add new TLD
router.post('/pricing', async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    tld, cost_register, cost_renew, cost_transfer,
    price_register, price_renew, price_transfer,
    price_privacy = 9.99
  } = req.body;

  if (!tld || !cost_register || !price_register) {
    return res.status(400).json({ error: 'TLD and pricing required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tld_pricing (
        tld, cost_register, cost_renew, cost_transfer,
        price_register, price_renew, price_transfer, price_privacy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        tld.toLowerCase(),
        cost_register, cost_renew || cost_register, cost_transfer || cost_register,
        price_register, price_renew || price_register, price_transfer || price_register,
        price_privacy
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'TLD already exists' });
    }
    console.error('Error adding TLD:', error);
    res.status(500).json({ error: 'Failed to add TLD' });
  }
});

// Activity logs
router.get('/activity', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 100, action, user_id } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT al.*, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      params.push(action);
      query += ` AND al.action = $${params.length}`;
    }

    if (user_id) {
      params.push(parseInt(user_id));
      query += ` AND al.user_id = $${params.length}`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      logs: result.rows,
      page: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Sync domains from eNom
router.post('/sync-enom', async (req, res) => {
  const pool = req.app.locals.pool;
  const { user_id = 1 } = req.body; // Default to admin user

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
        // Get detailed info for each domain
        const info = await enom.getDomainInfo(domain.sld, domain.tld);

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
          INSERT INTO domains (user_id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled, enom_order_id, enom_account, enom_mode)
          VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, 'main', $8)
          ON CONFLICT (domain_name) DO UPDATE SET
            expiration_date = EXCLUDED.expiration_date,
            auto_renew = EXCLUDED.auto_renew,
            privacy_enabled = EXCLUDED.privacy_enabled,
            enom_order_id = EXCLUDED.enom_order_id,
            enom_mode = EXCLUDED.enom_mode,
            updated_at = CURRENT_TIMESTAMP
        `, [user_id, domain.domain, domain.tld, expDate, domain.autoRenew, domain.privacyEnabled, domain.domainNameId, currentEnomMode]);

        imported.push({ domain: domain.domain, account: 'main' });
      } catch (err) {
        errors.push({ domain: domain.domain, error: err.message });
      }
    }

    // Try to get domains from sub-accounts by querying each domain directly
    for (const subAccount of subAccounts) {
      if (subAccount.domainCount > 0) {
        // Try common domain names based on sub-account info
        const possibleDomains = [];

        // Try domain based on email (e.g., admin@gobig.construction -> gobig.construction)
        if (subAccount.email) {
          const emailDomain = subAccount.email.split('@')[1];
          if (emailDomain) {
            const parts = emailDomain.split('.');
            if (parts.length >= 2) {
              possibleDomains.push({
                sld: parts.slice(0, -1).join('.'),
                tld: parts[parts.length - 1]
              });
            }
          }
        }

        for (const pd of possibleDomains) {
          try {
            const info = await enom.getDomainInfo(pd.sld, pd.tld);

            // Check if this domain belongs to the sub-account
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
                ON CONFLICT (domain_name) DO UPDATE SET
                  expiration_date = EXCLUDED.expiration_date,
                  auto_renew = EXCLUDED.auto_renew,
                  privacy_enabled = EXCLUDED.privacy_enabled,
                  enom_account = EXCLUDED.enom_account,
                  enom_mode = EXCLUDED.enom_mode,
                  updated_at = CURRENT_TIMESTAMP
              `, [user_id, `${pd.sld}.${pd.tld}`, pd.tld, expDate, info.autoRenew || false, info.whoisPrivacy || false, subAccount.loginId, currentEnomMode]);

              imported.push({ domain: `${pd.sld}.${pd.tld}`, account: subAccount.loginId });
            }
          } catch (err) {
            // Domain might not exist or not be accessible
          }
        }
      }
    }

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

    // Upsert domain
    const result = await pool.query(`
      INSERT INTO domains (user_id, domain_name, tld, status, registration_date, expiration_date, auto_renew, privacy_enabled, enom_account, enom_mode)
      VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9)
      ON CONFLICT (domain_name) DO UPDATE SET
        expiration_date = EXCLUDED.expiration_date,
        auto_renew = EXCLUDED.auto_renew,
        privacy_enabled = EXCLUDED.privacy_enabled,
        enom_account = EXCLUDED.enom_account,
        enom_mode = EXCLUDED.enom_mode,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [user_id, `${sld}.${tld}`, tld, regDate, expDate, info.autoRenew || false, info.whoisPrivacy || false, enom_account, enom.getMode().mode]);

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

// Trigger full domain data sync (fetches all data from eNom)
router.post('/sync-domains', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Get all domains that need syncing
    const result = await pool.query(`
      SELECT id, domain_name FROM domains
      WHERE status IN ('active', 'pending')
      ORDER BY last_synced_at ASC NULLS FIRST
    `);

    console.log(`[Admin Sync] Starting sync for ${result.rows.length} domains`);

    let synced = 0;
    let failed = 0;
    const details = [];

    for (const domain of result.rows) {
      try {
        const parts = domain.domain_name.split('.');
        const tld = parts.pop();
        const sld = parts.join('.');

        // Fetch comprehensive data from eNom (5 API calls in parallel)
        const data = await enom.getFullDomainData(sld, tld);

        // Parse expiration date
        let expDate = null;
        if (data.expirationDate) {
          const match = data.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            expDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          }
        }

        // Determine status
        let status = 'active';
        if (data.status === 'Expired') {
          status = 'expired';
        } else if (expDate && new Date(expDate) < new Date()) {
          status = 'expired';
        }

        await pool.query(`
          UPDATE domains SET
            expiration_date = COALESCE($1, expiration_date),
            auto_renew = $2,
            privacy_enabled = $3,
            lock_status = $4,
            nameservers = $5,
            enom_domain_id = $6,
            status = $7,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $8
        `, [
          expDate,
          data.autoRenew,
          data.privacyEnabled,
          data.lockStatus,
          JSON.stringify(data.nameservers),
          data.domainNameId,
          status,
          domain.id
        ]);

        synced++;
        details.push({ domain: domain.domain_name, status: 'synced', data });
      } catch (error) {
        failed++;
        details.push({ domain: domain.domain_name, status: 'failed', error: error.message });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    res.json({
      message: 'Domain sync completed',
      synced,
      failed,
      total: result.rows.length,
      details
    });
  } catch (error) {
    console.error('Error syncing domains:', error);
    res.status(500).json({ error: 'Failed to sync domains' });
  }
});

// ========== EMAIL TEMPLATE MANAGEMENT ==========

// List all email templates
router.get('/email-templates', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      'SELECT * FROM email_templates ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// Get single email template
router.get('/email-templates/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const templateId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [templateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

// Update email template
router.put('/email-templates/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const templateId = parseInt(req.params.id);
  const { name, description, subject, html_content, is_active } = req.body;

  try {
    const currentTemplate = await pool.query('SELECT * FROM email_templates WHERE id = $1', [templateId]);
    if (currentTemplate.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const result = await pool.query(
      `UPDATE email_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        subject = COALESCE($3, subject),
        html_content = COALESCE($4, html_content),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, description, subject, html_content, is_active, templateId]
    );

    // Clear the email service cache so it picks up the new template
    emailService.clearCache();

    await logAudit(pool, req.user.id, 'update_email_template', 'email_template', templateId,
      { subject: currentTemplate.rows[0].subject }, { subject: result.rows[0].subject }, req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

// Send test email
router.post('/email/test', async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'Recipient email required' });
  }

  try {
    const result = await emailService.sendTestEmail(to);
    res.json(result);
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Preview email template with sample data
router.post('/email-templates/:id/preview', async (req, res) => {
  const pool = req.app.locals.pool;
  const templateId = parseInt(req.params.id);
  const { sample_data = {} } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [templateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result.rows[0];

    // Replace variables with sample data or placeholders
    const variables = template.variables || [];
    const data = {};
    for (const v of variables) {
      data[v] = sample_data[v] || `{{${v}}}`;
    }

    const subject = emailService.replaceVariables(template.subject, data);
    const html = emailService.getBaseWrapper(emailService.replaceVariables(template.html_content, data));

    res.json({
      subject,
      html,
      variables: template.variables
    });
  } catch (error) {
    console.error('Error previewing email template:', error);
    res.status(500).json({ error: 'Failed to preview email template' });
  }
});

// Get email service status
router.get('/email/status', async (req, res) => {
  try {
    const hasTransporter = !!emailService.transporter;
    const config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER || 'support@worxtech.biz',
      from: emailService.from,
      fromName: emailService.fromName,
      connected: hasTransporter
    };
    res.json(config);
  } catch (error) {
    console.error('Error getting email status:', error);
    res.status(500).json({ error: 'Failed to get email status' });
  }
});

module.exports = router;
