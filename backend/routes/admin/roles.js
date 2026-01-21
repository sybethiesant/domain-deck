/**
 * Admin Roles Routes
 * Role management and permissions
 */
const express = require('express');
const router = express.Router();
const { logAudit, ROLE_LEVELS } = require('../../middleware/auth');

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

// Get all roles (super admin only)
router.get('/roles/all', async (req, res) => {
  const pool = req.app.locals.pool;

  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const result = await pool.query('SELECT * FROM roles ORDER BY level');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Get single role details
router.get('/roles/:level', async (req, res) => {
  const pool = req.app.locals.pool;
  const level = parseInt(req.params.level);

  try {
    const result = await pool.query('SELECT * FROM roles WHERE level = $1', [level]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Get users with this role
    const usersResult = await pool.query(
      `SELECT id, username, email, created_at FROM users WHERE role_level = $1 ORDER BY created_at DESC LIMIT 50`,
      [level]
    );

    res.json({
      ...result.rows[0],
      users: usersResult.rows
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    res.status(500).json({ error: 'Failed to fetch role' });
  }
});

// Update role permissions (super admin only)
router.put('/roles/:level', async (req, res) => {
  const pool = req.app.locals.pool;
  const level = parseInt(req.params.level);
  const { display_name, description, permissions } = req.body;

  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  // Cannot modify super admin role
  if (level >= ROLE_LEVELS.SUPERADMIN) {
    return res.status(403).json({ error: 'Cannot modify super admin role' });
  }

  try {
    const currentResult = await pool.query('SELECT * FROM roles WHERE level = $1', [level]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const oldValues = currentResult.rows[0];

    const result = await pool.query(
      `UPDATE roles SET
        display_name = COALESCE($1, display_name),
        description = COALESCE($2, description),
        permissions = COALESCE($3, permissions)
       WHERE level = $4
       RETURNING *`,
      [display_name, description, permissions ? JSON.stringify(permissions) : null, level]
    );

    await logAudit(pool, req.user.id, 'update_role', 'role', level, oldValues, result.rows[0], req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Get all available permissions
router.get('/permissions', async (req, res) => {
  // Define all available permissions
  const permissions = [
    // Customer permissions
    { key: 'view_own_domains', category: 'Domains', description: 'View own domains' },
    { key: 'manage_own_domains', category: 'Domains', description: 'Manage own domain settings' },
    { key: 'view_own_orders', category: 'Orders', description: 'View own orders' },
    { key: 'manage_own_profile', category: 'Profile', description: 'Manage own profile' },
    { key: 'manage_cart', category: 'Cart', description: 'Manage shopping cart' },

    // Support permissions
    { key: 'view_all_customers', category: 'Customers', description: 'View all customer accounts' },
    { key: 'view_all_orders', category: 'Orders', description: 'View all orders' },
    { key: 'view_all_domains', category: 'Domains', description: 'View all domains' },
    { key: 'add_notes', category: 'Notes', description: 'Add staff notes' },

    // Sales permissions
    { key: 'process_refunds', category: 'Orders', description: 'Process refunds' },
    { key: 'adjust_pricing', category: 'Pricing', description: 'Adjust pricing on orders' },
    { key: 'import_domains', category: 'Domains', description: 'Import domains from eNom' },

    // Admin permissions
    { key: 'manage_users', category: 'Users', description: 'Manage user accounts' },
    { key: 'manage_tld_pricing', category: 'Pricing', description: 'Manage TLD pricing' },
    { key: 'system_settings', category: 'System', description: 'Modify system settings' },
    { key: 'view_audit_logs', category: 'Audit', description: 'View audit logs' },

    // Super admin
    { key: '*', category: 'All', description: 'All permissions (super admin)' }
  ];

  res.json(permissions);
});

// Get users by role
router.get('/roles/:level/users', async (req, res) => {
  const pool = req.app.locals.pool;
  const level = parseInt(req.params.level);
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const result = await pool.query(
      `SELECT id, username, email, full_name, created_at, last_login_at
       FROM users
       WHERE role_level = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [level, parseInt(limit), offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE role_level = $1',
      [level]
    );

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching role users:', error);
    res.status(500).json({ error: 'Failed to fetch role users' });
  }
});

module.exports = router;
