/**
 * Admin Balance Management Routes
 * eNom account balance and refill management
 *
 * Access Levels:
 * - Level 3+: Full access to balance management
 */
const express = require('express');
const router = express.Router();
const enom = require('../../services/enom');
const { ROLE_LEVELS } = require('../../middleware/auth');

// Apply admin level check to all balance routes
router.use((req, res, next) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required for balance management' });
  }
  next();
});

// Get current balance
router.get('/', async (req, res) => {
  try {
    const balance = await enom.getDetailedBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Get balance settings
router.get('/settings', async (req, res) => {
  const pool = req.app.locals.pool;
  
  try {
    const result = await pool.query(
      'SELECT * FROM balance_settings ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      return res.json({
        id: null,
        auto_refill_enabled: false,
        min_balance_threshold: 50.00,
        refill_amount: 100.00,
        low_balance_alert: 25.00,
        email_alerts_enabled: true,
        alert_email: null
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching balance settings:', error);
    res.status(500).json({ error: 'Failed to fetch balance settings' });
  }
});

// Update balance settings
router.put('/settings', async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    auto_refill_enabled,
    min_balance_threshold,
    refill_amount,
    low_balance_alert,
    email_alerts_enabled,
    alert_email
  } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM balance_settings LIMIT 1');
    
    if (existing.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO balance_settings 
         (auto_refill_enabled, min_balance_threshold, refill_amount, low_balance_alert, email_alerts_enabled, alert_email)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [auto_refill_enabled, min_balance_threshold, refill_amount, low_balance_alert, email_alerts_enabled, alert_email]
      );
      return res.json(result.rows[0]);
    } else {
      const result = await pool.query(
        `UPDATE balance_settings SET
         auto_refill_enabled = COALESCE($1, auto_refill_enabled),
         min_balance_threshold = COALESCE($2, min_balance_threshold),
         refill_amount = COALESCE($3, refill_amount),
         low_balance_alert = COALESCE($4, low_balance_alert),
         email_alerts_enabled = COALESCE($5, email_alerts_enabled),
         alert_email = COALESCE($6, alert_email),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [auto_refill_enabled, min_balance_threshold, refill_amount, low_balance_alert, email_alerts_enabled, alert_email, existing.rows[0].id]
      );
      return res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error updating balance settings:', error);
    res.status(500).json({ error: 'Failed to update balance settings' });
  }
});

// Manual refill account
router.post('/refill', async (req, res) => {
  const pool = req.app.locals.pool;
  const { amount } = req.body;

  if (!amount || amount < 25) {
    return res.status(400).json({ error: 'Minimum refill amount is $25' });
  }

  try {
    const balanceBefore = await enom.getDetailedBalance();
    const refillResult = await enom.refillAccount(amount);
    const balanceAfter = await enom.getDetailedBalance();
    
    await pool.query(
      `INSERT INTO balance_transactions 
       (transaction_type, amount, fee_amount, net_amount, balance_before, balance_after, initiated_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['refill', amount, refillResult.feeAmount, refillResult.netAmount, balanceBefore.availableBalance, balanceAfter.availableBalance, req.user.id, 'Manual refill from admin panel']
    );

    res.json({
      success: true,
      refillResult,
      balanceBefore: balanceBefore.availableBalance,
      balanceAfter: balanceAfter.availableBalance
    });
  } catch (error) {
    console.error('Error refilling account:', error);
    res.status(500).json({ error: 'Failed to refill account: ' + error.message });
  }
});

// Calculate refill needed
router.post('/calculate', async (req, res) => {
  const { domainCost } = req.body;

  if (!domainCost || domainCost <= 0) {
    return res.status(400).json({ error: 'Valid domain cost required' });
  }

  try {
    const balance = await enom.getDetailedBalance();
    const calculation = enom.calculateRefillNeeded(domainCost, balance.availableBalance);
    
    res.json({
      currentBalance: balance.availableBalance,
      domainCost,
      ...calculation
    });
  } catch (error) {
    console.error('Error calculating refill:', error);
    res.status(500).json({ error: 'Failed to calculate refill' });
  }
});

// Get transaction history
router.get('/transactions', async (req, res) => {
  const pool = req.app.locals.pool;
  const page = Math.max(1, Math.min(parseInt(req.query.page) || 1, 10000));
  const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 100));
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT bt.*, u.username as initiated_by_username
       FROM balance_transactions bt
       LEFT JOIN users u ON bt.initiated_by = u.id
       ORDER BY bt.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM balance_transactions');

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Check balance health
router.get('/health', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const balance = await enom.getDetailedBalance();
    const settings = await pool.query('SELECT * FROM balance_settings LIMIT 1');
    
    const config = settings.rows[0] || {
      min_balance_threshold: 50,
      low_balance_alert: 25
    };

    const health = {
      balance: balance.availableBalance,
      status: 'healthy',
      alerts: []
    };

    if (balance.availableBalance < config.low_balance_alert) {
      health.status = 'critical';
      health.alerts.push('Balance below critical threshold ($' + config.low_balance_alert + ')');
    } else if (balance.availableBalance < config.min_balance_threshold) {
      health.status = 'warning';
      health.alerts.push('Balance below minimum threshold ($' + config.min_balance_threshold + ')');
    }

    res.json(health);
  } catch (error) {
    console.error('Error checking balance health:', error);
    res.status(500).json({ error: 'Failed to check balance health' });
  }
});

module.exports = router;
