/**
 * Admin Audit Log Routes
 * Audit logs and activity tracking
 */
const express = require('express');
const router = express.Router();
const { ROLE_LEVELS } = require('../../middleware/auth');

// Get audit logs (super admin only)
router.get('/audit-logs', async (req, res) => {
  const pool = req.app.locals.pool;

  // Require higher access for audit logs
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const {
    page = 1,
    limit = 100,
    user_id,
    action,
    entity_type,
    start_date,
    end_date,
    search
  } = req.query;
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

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.username ILIKE $${params.length} OR al.action ILIKE $${params.length})`;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count with same filters as main query
    let countQuery = 'SELECT COUNT(*) FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
    const countParams = [];
    if (user_id) {
      countParams.push(parseInt(user_id));
      countQuery += ` AND al.user_id = $${countParams.length}`;
    }
    if (action) {
      countParams.push(action);
      countQuery += ` AND al.action = $${countParams.length}`;
    }
    if (entity_type) {
      countParams.push(entity_type);
      countQuery += ` AND al.entity_type = $${countParams.length}`;
    }
    if (start_date) {
      countParams.push(start_date);
      countQuery += ` AND al.created_at >= $${countParams.length}`;
    }
    if (end_date) {
      countParams.push(end_date);
      countQuery += ` AND al.created_at <= $${countParams.length}`;
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (u.username ILIKE $${countParams.length} OR al.action ILIKE $${countParams.length})`;
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

// Get audit log actions (for filter dropdown)
// Get audit actions breakdown
// Requires level 3+ (Admin)
router.get('/audit-logs/actions', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(`
      SELECT DISTINCT action, COUNT(*) as count
      FROM audit_logs
      GROUP BY action
      ORDER BY count DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audit actions:', error);
    res.status(500).json({ error: 'Failed to fetch audit actions' });
  }
});

// Get audit log entity types (for filter dropdown)
// Get audit entity types breakdown
// Requires level 3+ (Admin)
router.get('/audit-logs/entity-types', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(`
      SELECT DISTINCT entity_type, COUNT(*) as count
      FROM audit_logs
      WHERE entity_type IS NOT NULL
      GROUP BY entity_type
      ORDER BY count DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching entity types:', error);
    res.status(500).json({ error: 'Failed to fetch entity types' });
  }
});

// Activity logs (user actions)
// Get activity logs
// Requires level 3+ (Admin)
router.get('/activity', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const pool = req.app.locals.pool;
  const { page = 1, limit = 100, action, user_id, entity_type, start_date, end_date } = req.query;
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

    // Get total count with same filters as main query
    let countQuery = 'SELECT COUNT(*) FROM activity_logs WHERE 1=1';
    const countParams = [];
    if (action) {
      countParams.push(action);
      countQuery += ` AND action = $${countParams.length}`;
    }
    if (user_id) {
      countParams.push(parseInt(user_id));
      countQuery += ` AND user_id = $${countParams.length}`;
    }
    if (entity_type) {
      countParams.push(entity_type);
      countQuery += ` AND entity_type = $${countParams.length}`;
    }
    if (start_date) {
      countParams.push(start_date);
      countQuery += ` AND created_at >= $${countParams.length}`;
    }
    if (end_date) {
      countParams.push(end_date);
      countQuery += ` AND created_at <= $${countParams.length}`;
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Get activity summary for dashboard
// Get activity summary
// Requires level 3+ (Admin)
router.get('/activity/summary', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const pool = req.app.locals.pool;
  const days = Math.max(1, Math.min(parseInt(req.query.days) || 7, 365)); // Bounded 1-365

  try {
    const [byAction, byDay, topUsers] = await Promise.all([
      // Actions breakdown
      pool.query(`
        SELECT action, COUNT(*) as count
        FROM activity_logs
        WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
      `, [days]),
      // Activity by day
      pool.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM activity_logs
        WHERE created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [days]),
      // Most active users
      pool.query(`
        SELECT al.user_id, u.username, COUNT(*) as action_count
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= CURRENT_DATE - INTERVAL '1 day' * $1
          AND al.user_id IS NOT NULL
        GROUP BY al.user_id, u.username
        ORDER BY action_count DESC
        LIMIT 10
      `, [days])
    ]);

    res.json({
      period: `${days} days`,
      byAction: byAction.rows,
      byDay: byDay.rows,
      topUsers: topUsers.rows
    });
  } catch (error) {
    console.error('Error fetching activity summary:', error);
    res.status(500).json({ error: 'Failed to fetch activity summary' });
  }
});

module.exports = router;
