const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

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
  const { page = 1, limit = 50, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.is_admin,
             u.created_at, u.last_login_at,
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

// Update user (admin toggle)
router.put('/users/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { is_admin } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users SET is_admin = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, email, is_admin`,
      [!!is_admin, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
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

// List all domains
router.get('/domains', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 50, status, expiring } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
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
    }

    query += ` ORDER BY d.expiration_date ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      domains: result.rows,
      page: parseInt(page)
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

module.exports = router;
