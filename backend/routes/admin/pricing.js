/**
 * Admin TLD Pricing Routes
 * TLD pricing management
 */
const express = require('express');
const router = express.Router();
const { logAudit } = require('../../middleware/auth');

// Get all TLD pricing (including costs)
router.get('/pricing', async (req, res) => {
  const pool = req.app.locals.pool;
  const { active_only } = req.query;

  try {
    let query = 'SELECT * FROM tld_pricing';
    if (active_only === 'true') {
      query += ' WHERE is_active = true';
    }
    query += ' ORDER BY tld';

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// Get single TLD pricing
router.get('/pricing/:tld', async (req, res) => {
  const pool = req.app.locals.pool;
  const { tld } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM tld_pricing WHERE tld = $1',
      [tld.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'TLD not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching TLD pricing:', error);
    res.status(500).json({ error: 'Failed to fetch TLD pricing' });
  }
});

// Update TLD pricing
router.put('/pricing/:tld', async (req, res) => {
  const pool = req.app.locals.pool;
  const { tld } = req.params;
  const {
    cost_register, cost_renew, cost_transfer,
    price_register, price_renew, price_transfer,
    price_privacy, min_years, max_years, is_active,
    promo_price, promo_expires_at
  } = req.body;

  try {
    // Get current values for audit
    const currentResult = await pool.query('SELECT * FROM tld_pricing WHERE tld = $1', [tld.toLowerCase()]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'TLD not found' });
    }

    const oldValues = currentResult.rows[0];

    const result = await pool.query(
      `UPDATE tld_pricing SET
        cost_register = COALESCE($1, cost_register),
        cost_renew = COALESCE($2, cost_renew),
        cost_transfer = COALESCE($3, cost_transfer),
        price_register = COALESCE($4, price_register),
        price_renew = COALESCE($5, price_renew),
        price_transfer = COALESCE($6, price_transfer),
        price_privacy = COALESCE($7, price_privacy),
        min_years = COALESCE($8, min_years),
        max_years = COALESCE($9, max_years),
        is_active = COALESCE($10, is_active),
        promo_price = $11,
        promo_expires_at = $12,
        updated_at = CURRENT_TIMESTAMP
       WHERE tld = $13
       RETURNING *`,
      [
        cost_register, cost_renew, cost_transfer,
        price_register, price_renew, price_transfer,
        price_privacy, min_years, max_years, is_active,
        promo_price || null, promo_expires_at || null,
        tld.toLowerCase()
      ]
    );

    await logAudit(pool, req.user.id, 'update_tld_pricing', 'tld_pricing', null, oldValues, result.rows[0], req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// Add new TLD
router.post('/pricing', async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    tld, cost_register, cost_renew, cost_transfer,
    price_register, price_renew, price_transfer,
    price_privacy = 9.99, min_years = 1, max_years = 10
  } = req.body;

  if (!tld || !cost_register || !price_register) {
    return res.status(400).json({ error: 'TLD, cost_register, and price_register are required' });
  }

  // Validate pricing makes sense
  if (parseFloat(price_register) < parseFloat(cost_register)) {
    return res.status(400).json({ error: 'Selling price cannot be less than cost' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tld_pricing (
        tld, cost_register, cost_renew, cost_transfer,
        price_register, price_renew, price_transfer,
        price_privacy, min_years, max_years
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        tld.toLowerCase().replace(/^\./, ''), // Remove leading dot if present
        cost_register,
        cost_renew || cost_register,
        cost_transfer || cost_register,
        price_register,
        price_renew || price_register,
        price_transfer || price_register,
        price_privacy, min_years, max_years
      ]
    );

    await logAudit(pool, req.user.id, 'add_tld', 'tld_pricing', null, null, result.rows[0], req);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'TLD already exists' });
    }
    console.error('Error adding TLD:', error);
    res.status(500).json({ error: 'Failed to add TLD' });
  }
});

// Delete TLD (soft delete by deactivating)
router.delete('/pricing/:tld', async (req, res) => {
  const pool = req.app.locals.pool;
  const { tld } = req.params;
  const { hard_delete } = req.query;

  try {
    if (hard_delete === 'true') {
      // Check if any domains use this TLD
      const domainsResult = await pool.query('SELECT COUNT(*) FROM domains WHERE tld = $1', [tld.toLowerCase()]);
      if (parseInt(domainsResult.rows[0].count) > 0) {
        return res.status(400).json({ error: 'Cannot delete TLD with existing domains' });
      }

      await pool.query('DELETE FROM tld_pricing WHERE tld = $1', [tld.toLowerCase()]);
      await logAudit(pool, req.user.id, 'delete_tld', 'tld_pricing', null, { tld }, null, req);
    } else {
      await pool.query(
        'UPDATE tld_pricing SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE tld = $1',
        [tld.toLowerCase()]
      );
      await logAudit(pool, req.user.id, 'deactivate_tld', 'tld_pricing', null, { tld }, { is_active: false }, req);
    }

    res.json({ success: true, message: hard_delete === 'true' ? 'TLD deleted' : 'TLD deactivated' });
  } catch (error) {
    console.error('Error deleting TLD:', error);
    res.status(500).json({ error: 'Failed to delete TLD' });
  }
});

// Bulk import TLD pricing
router.post('/pricing/import', async (req, res) => {
  const pool = req.app.locals.pool;
  const { tlds } = req.body;

  if (!Array.isArray(tlds) || tlds.length === 0) {
    return res.status(400).json({ error: 'Array of TLDs required' });
  }

  try {
    const results = { imported: 0, updated: 0, errors: [] };

    for (const tld of tlds) {
      try {
        await pool.query(
          `INSERT INTO tld_pricing (
            tld, cost_register, cost_renew, cost_transfer,
            price_register, price_renew, price_transfer, price_privacy
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tld) DO UPDATE SET
            cost_register = $2,
            cost_renew = $3,
            cost_transfer = $4,
            price_register = $5,
            price_renew = $6,
            price_transfer = $7,
            price_privacy = $8,
            updated_at = CURRENT_TIMESTAMP`,
          [
            tld.tld.toLowerCase(),
            tld.cost_register, tld.cost_renew || tld.cost_register, tld.cost_transfer || tld.cost_register,
            tld.price_register, tld.price_renew || tld.price_register, tld.price_transfer || tld.price_register,
            tld.price_privacy || 9.99
          ]
        );
        results.imported++;
      } catch (error) {
        results.errors.push({ tld: tld.tld, error: error.message });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error importing TLDs:', error);
    res.status(500).json({ error: 'Failed to import TLDs' });
  }
});

module.exports = router;
