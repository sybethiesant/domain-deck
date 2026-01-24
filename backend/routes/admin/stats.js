/**
 * Admin Statistics Routes
 * Dashboard statistics and metrics
 *
 * Access Level: Admin (Level 3+) required for all routes
 * Revenue and business metrics are sensitive data
 */
const express = require('express');
const router = express.Router();
const { ROLE_LEVELS } = require('../../middleware/auth');

// Helper to check admin level
const requireAdminLevel = (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    res.status(403).json({ error: 'Admin access required to view statistics' });
    return false;
  }
  return true;
};

// Dashboard statistics
// Requires Admin (Level 3+) - contains sensitive revenue data
router.get('/stats', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;

  const pool = req.app.locals.pool;

  try {
    const stats = {};

    // Execute all stat queries in parallel for performance
    const [
      usersResult,
      domainsResult,
      activeDomainsResult,
      ordersResult,
      revenueResult,
      todayOrdersResult,
      todayRevenueResult,
      expiringSoonResult,
      pendingOrdersResult,
      pendingTransfersResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM domains'),
      pool.query("SELECT COUNT(*) FROM domains WHERE status = 'active'"),
      pool.query('SELECT COUNT(*) FROM orders'),
      pool.query("SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE payment_status = 'paid'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE created_at >= CURRENT_DATE"),
      pool.query(`SELECT COALESCE(SUM(total), 0) as revenue FROM orders
                  WHERE created_at >= CURRENT_DATE AND payment_status = 'paid'`),
      pool.query(`SELECT COUNT(*) FROM domains
                  WHERE expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM domain_transfers WHERE status = 'pending'")
    ]);

    stats.totalUsers = parseInt(usersResult.rows[0].count);
    stats.totalDomains = parseInt(domainsResult.rows[0].count);
    stats.activeDomains = parseInt(activeDomainsResult.rows[0].count);
    stats.totalOrders = parseInt(ordersResult.rows[0].count);
    stats.totalRevenue = parseFloat(revenueResult.rows[0].revenue);
    stats.ordersToday = parseInt(todayOrdersResult.rows[0].count);
    stats.revenueToday = parseFloat(todayRevenueResult.rows[0].revenue);
    stats.expiringSoon = parseInt(expiringSoonResult.rows[0].count);
    stats.pendingOrders = parseInt(pendingOrdersResult.rows[0].count);
    stats.pendingTransfers = parseInt(pendingTransfersResult.rows[0].count);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Revenue breakdown by period
// Requires Admin (Level 3+)
router.get('/stats/revenue', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;

  const pool = req.app.locals.pool;
  const { period = '30d' } = req.query;

  try {
    let interval;
    switch (period) {
      case '7d': interval = '7 days'; break;
      case '30d': interval = '30 days'; break;
      case '90d': interval = '90 days'; break;
      case '1y': interval = '1 year'; break;
      default: interval = '30 days';
    }

    const result = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as revenue
      FROM orders
      WHERE created_at >= CURRENT_DATE - $1::interval
        AND payment_status = 'paid'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [interval]);

    res.json({
      period,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching revenue stats:', error);
    res.status(500).json({ error: 'Failed to fetch revenue statistics' });
  }
});

// Domain statistics breakdown
// Requires Admin (Level 3+)
router.get('/stats/domains', async (req, res) => {
  if (!requireAdminLevel(req, res)) return;

  const pool = req.app.locals.pool;

  try {
    const [byStatus, byTld, expiring] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*) as count
        FROM domains
        GROUP BY status
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT tld, COUNT(*) as count
        FROM domains
        GROUP BY tld
        ORDER BY count DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT
          CASE
            WHEN expiration_date < CURRENT_DATE THEN 'expired'
            WHEN expiration_date < CURRENT_DATE + INTERVAL '7 days' THEN '7_days'
            WHEN expiration_date < CURRENT_DATE + INTERVAL '30 days' THEN '30_days'
            WHEN expiration_date < CURRENT_DATE + INTERVAL '90 days' THEN '90_days'
            ELSE 'ok'
          END as urgency,
          COUNT(*) as count
        FROM domains
        WHERE status = 'active'
        GROUP BY urgency
      `)
    ]);

    res.json({
      byStatus: byStatus.rows,
      byTld: byTld.rows,
      expiring: expiring.rows
    });
  } catch (error) {
    console.error('Error fetching domain stats:', error);
    res.status(500).json({ error: 'Failed to fetch domain statistics' });
  }
});

module.exports = router;
