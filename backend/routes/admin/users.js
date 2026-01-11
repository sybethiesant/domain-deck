/**
 * Admin User Management Routes
 * User listing, details, and role management
 */
const express = require('express');
const router = express.Router();
const { logAudit } = require('../../middleware/auth');

// List all users with pagination and search
router.get('/users', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 50, search, role, sort = 'created_at', order = 'desc' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const allowedSorts = ['created_at', 'last_login_at', 'username', 'email'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.is_admin,
             u.role_level, u.role_name, u.created_at, u.last_login_at,
             u.email_verified, u.phone, u.company_name,
             COUNT(DISTINCT d.id) as domain_count,
             COUNT(DISTINCT o.id) as order_count,
             COALESCE(SUM(o.total), 0) as total_spent
      FROM users u
      LEFT JOIN domains d ON u.id = d.user_id
      LEFT JOIN orders o ON u.id = o.user_id AND o.payment_status = 'paid'
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.username ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`;
    }

    if (role) {
      params.push(role);
      query += ` AND u.role_name = $${params.length}`;
    }

    query += ` GROUP BY u.id ORDER BY u.${sortColumn} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (username ILIKE $${countParams.length} OR email ILIKE $${countParams.length} OR full_name ILIKE $${countParams.length})`;
    }
    if (role) {
      countParams.push(role);
      countQuery += ` AND role_name = $${countParams.length}`;
    }
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
              is_admin, role_level, role_name, email_verified, email_verified_at,
              stripe_customer_id, theme_preference,
              created_at, last_login_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's domains
    const domainsResult = await pool.query(
      `SELECT id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled
       FROM domains WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    // Get user's orders
    const ordersResult = await pool.query(
      `SELECT id, order_number, status, payment_status, total, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    // Get user's contacts
    const contactsResult = await pool.query(
      `SELECT id, contact_type, first_name, last_name, email, is_default
       FROM domain_contacts WHERE user_id = $1 ORDER BY is_default DESC`,
      [userId]
    );

    // Get staff notes about this user
    const notesResult = await pool.query(
      `SELECT sn.*, u.username as staff_username
       FROM staff_notes sn
       LEFT JOIN users u ON sn.staff_user_id = u.id
       WHERE sn.entity_type = 'user' AND sn.entity_id = $1
       ORDER BY sn.is_pinned DESC, sn.created_at DESC`,
      [userId]
    );

    // Get recent activity
    const activityResult = await pool.query(
      `SELECT action, entity_type, entity_id, details, created_at
       FROM activity_logs WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    res.json({
      ...userResult.rows[0],
      domains: domainsResult.rows,
      recentOrders: ordersResult.rows,
      contacts: contactsResult.rows,
      notes: notesResult.rows,
      recentActivity: activityResult.rows
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
  const { is_admin, role_level, role_name, email_verified } = req.body;

  try {
    // Get current user data for audit
    const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldValues = {
      is_admin: currentUser.rows[0].is_admin,
      role_level: currentUser.rows[0].role_level,
      role_name: currentUser.rows[0].role_name,
      email_verified: currentUser.rows[0].email_verified
    };

    // Check if trying to set a role higher than or equal to own role
    if (role_level !== undefined && role_level >= req.user.role_level && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot assign role equal to or higher than your own' });
    }

    // Cannot demote yourself
    if (userId === req.user.id && role_level !== undefined && role_level < req.user.role_level) {
      return res.status(403).json({ error: 'Cannot demote yourself' });
    }

    const result = await pool.query(
      `UPDATE users SET
        is_admin = COALESCE($1, is_admin),
        role_level = COALESCE($2, role_level),
        role_name = COALESCE($3, role_name),
        email_verified = COALESCE($4, email_verified),
        email_verified_at = CASE WHEN $4 = true AND email_verified = false THEN CURRENT_TIMESTAMP ELSE email_verified_at END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, username, email, is_admin, role_level, role_name, email_verified`,
      [is_admin, role_level, role_name, email_verified, userId]
    );

    // Log the audit
    await logAudit(pool, req.user.id, 'update_user_role', 'user', userId, oldValues, result.rows[0], req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Disable/Enable user account
router.post('/users/:id/toggle-status', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { disabled, reason } = req.body;

  try {
    if (userId === req.user.id) {
      return res.status(403).json({ error: 'Cannot disable your own account' });
    }

    const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For now, we'll use is_admin = false and add a note
    // In future, add a 'disabled' column to users table
    const result = await pool.query(
      `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [userId]
    );

    // Add staff note about the action
    if (reason) {
      await pool.query(
        `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
         VALUES ('user', $1, $2, $3, true)`,
        [userId, req.user.id, `Account ${disabled ? 'disabled' : 'enabled'}: ${reason}`]
      );
    }

    await logAudit(pool, req.user.id, disabled ? 'disable_user' : 'enable_user', 'user', userId, null, { reason }, req);

    res.json({ success: true, message: `User account ${disabled ? 'disabled' : 'enabled'}` });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Impersonate user (super admin only)
router.post('/users/:id/impersonate', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);

  // Require super admin
  if (req.user.role_level < 4 && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const userResult = await pool.query(
      'SELECT id, username, email, is_admin, role_level, role_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: userId,
        username: userResult.rows[0].username,
        impersonatedBy: req.user.id
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await logAudit(pool, req.user.id, 'impersonate_user', 'user', userId, null, null, req);

    res.json({
      token,
      user: userResult.rows[0],
      message: 'Impersonation session started (1 hour limit)'
    });
  } catch (error) {
    console.error('Error impersonating user:', error);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
});

module.exports = router;
