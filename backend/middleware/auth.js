const jwt = require('jsonwebtoken');

// Role levels for reference
const ROLE_LEVELS = {
  CUSTOMER: 0,
  SUPPORT: 1,
  SALES: 2,
  ADMIN: 3,
  SUPERADMIN: 4
};

// Basic auth middleware - validates JWT token
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Fetch full user with role info from database
const loadUserRole = async (req, res, next) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      'SELECT id, username, email, is_admin, role_level, role_name FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = { ...req.user, ...result.rows[0] };
    next();
  } catch (error) {
    console.error('Error loading user role:', error);
    res.status(500).json({ error: 'Failed to load user data' });
  }
};

// Admin middleware - requires user to be admin (level 3+) or is_admin flag
const adminMiddleware = async (req, res, next) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      'SELECT is_admin, role_level FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user || (!user.is_admin && user.role_level < ROLE_LEVELS.ADMIN)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user.role_level = user.role_level;
    req.user.is_admin = user.is_admin;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
};

// Role level middleware factory - requires minimum role level
const requireRole = (minLevel) => {
  return async (req, res, next) => {
    const pool = req.app.locals.pool;

    try {
      const result = await pool.query(
        'SELECT role_level, role_name, is_admin FROM users WHERE id = $1',
        [req.user.id]
      );

      const user = result.rows[0];
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Super admin (level 4) or is_admin flag always has access
      if (user.is_admin || user.role_level >= minLevel) {
        req.user.role_level = user.role_level;
        req.user.role_name = user.role_name;
        req.user.is_admin = user.is_admin;
        return next();
      }

      return res.status(403).json({
        error: 'Insufficient permissions',
        required_level: minLevel,
        your_level: user.role_level
      });
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
};

// Permission check middleware factory
const requirePermission = (permission) => {
  return async (req, res, next) => {
    const pool = req.app.locals.pool;

    try {
      const result = await pool.query(`
        SELECT u.role_level, u.is_admin, r.permissions
        FROM users u
        LEFT JOIN roles r ON r.level = u.role_level
        WHERE u.id = $1
      `, [req.user.id]);

      const user = result.rows[0];
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Super admin has all permissions
      if (user.is_admin || user.role_level >= ROLE_LEVELS.SUPERADMIN) {
        req.user.role_level = user.role_level;
        return next();
      }

      const permissions = user.permissions || [];
      if (permissions.includes('*') || permissions.includes(permission)) {
        req.user.role_level = user.role_level;
        return next();
      }

      return res.status(403).json({
        error: 'Permission denied',
        required_permission: permission
      });
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Failed to verify permissions' });
    }
  };
};

// Staff middleware - any staff member (level 1+)
const staffMiddleware = requireRole(ROLE_LEVELS.SUPPORT);

// Sales middleware - sales manager or higher (level 2+)
const salesMiddleware = requireRole(ROLE_LEVELS.SALES);

// Super admin middleware - super admin only (level 4)
const superAdminMiddleware = requireRole(ROLE_LEVELS.SUPERADMIN);

// Audit logging helper
const logAudit = async (pool, userId, action, entityType, entityId, oldValues, newValues, req) => {
  try {
    await pool.query(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      action,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req?.ip || req?.connection?.remoteAddress,
      req?.get('User-Agent')
    ]);
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  loadUserRole,
  requireRole,
  requirePermission,
  staffMiddleware,
  salesMiddleware,
  superAdminMiddleware,
  logAudit,
  ROLE_LEVELS
};
