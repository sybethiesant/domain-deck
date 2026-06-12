const jwt = require('jsonwebtoken');

// Role levels for reference
const ROLE_LEVELS = {
  CUSTOMER: 0,
  SUPPORT: 1,
  SALES: 2,
  ADMIN: 3,
  SUPERADMIN: 4
};

// The legacy is_admin boolean grants at most ADMIN (level 3). It must never
// satisfy a SUPERADMIN gate — letting it do so meant any account with
// is_admin=true (settable by a level-3 admin) bypassed every level-4 check
// in the codebase: a straight privilege-escalation path.
const effectiveRoleLevel = (user) => {
  const level = parseInt(user.role_level, 10) || 0;
  return user.is_admin ? Math.max(level, ROLE_LEVELS.ADMIN) : level;
};

// Basic auth middleware - validates JWT token and loads the current user.
// Loading from the database on every request means disabling an account or
// demoting a role takes effect immediately instead of waiting out a 7-day JWT.
const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Validate that the token contains required user ID
  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: 'Invalid token: missing user ID' });
  }

  try {
    const pool = req.app.locals.pool;
    const result = await pool.query(
      'SELECT id, username, email, is_admin, role_level, role_name, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.is_active === false) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    req.user = { ...decoded, ...user, role_level: effectiveRoleLevel(user) };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
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

// Admin middleware - requires effective admin (level 3+)
const adminMiddleware = async (req, res, next) => {
  if (!req.user || effectiveRoleLevel(req.user) < ROLE_LEVELS.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Role level middleware factory - requires minimum effective role level.
// authMiddleware has already loaded the fresh user row, so the effective
// level on req.user is authoritative; is_admin no longer short-circuits
// arbitrary levels (it is folded into effectiveRoleLevel, capped at ADMIN).
const requireRole = (minLevel) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (effectiveRoleLevel(req.user) >= minLevel) {
      return next();
    }

    return res.status(403).json({
      error: 'Insufficient permissions',
      required_level: minLevel,
      your_level: req.user.role_level
    });
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

      // Only genuine super admins (level 4) hold every permission — the
      // is_admin flag maps to the admin role's permission set instead of '*'.
      if (effectiveRoleLevel(user) >= ROLE_LEVELS.SUPERADMIN) {
        return next();
      }

      const permissions = user.permissions || [];
      if (permissions.includes('*') || permissions.includes(permission)) {
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

// Validation helpers

/**
 * Parse and validate an integer parameter
 * @param {string} value - The value to parse
 * @param {object} options - Options for validation
 * @returns {number|null} - The parsed integer or null if invalid
 */
const parseIntParam = (value, options = {}) => {
  const { min = 1, max = Number.MAX_SAFE_INTEGER } = options;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
};

/**
 * Middleware factory to validate integer parameters
 * @param {string[]} params - Parameter names to validate
 * @param {object} options - Validation options
 */
const validateIntParams = (params, options = {}) => {
  return (req, res, next) => {
    for (const param of params) {
      const value = req.params[param];
      const parsed = parseIntParam(value, options);
      if (parsed === null) {
        return res.status(400).json({ error: `Invalid ${param}: must be a positive integer` });
      }
      req.params[param] = parsed; // Replace with validated integer
    }
    next();
  };
};

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
  parseIntParam,
  validateIntParams,
  ROLE_LEVELS
};
