const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Get cart contents
router.get('/', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Clean only this user's expired items (global cleanup handled by cron job)
    await pool.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND expires_at < CURRENT_TIMESTAMP',
      [req.user.id]
    );

    const result = await pool.query(
      `SELECT id, item_type, domain_name, tld, years, price, options, created_at
       FROM cart_items
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const items = result.rows;
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.price), 0);

    res.json({
      items,
      subtotal,
      itemCount: items.length
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Add item to cart
router.post('/add', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const { item_type, domain_name, tld, years = 1, options = {} } = req.body;

  // Validation
  if (!['register', 'transfer', 'renew'].includes(item_type)) {
    return res.status(400).json({ error: 'Invalid item type' });
  }

  if (!domain_name || !tld) {
    return res.status(400).json({ error: 'Domain name and TLD required' });
  }

  if (years < 1 || years > 10) {
    return res.status(400).json({ error: 'Years must be between 1 and 10' });
  }

  const fullDomain = `${domain_name}.${tld}`.toLowerCase();

  try {
    // Check if item already in cart
    const existingResult = await pool.query(
      `SELECT id FROM cart_items
       WHERE user_id = $1 AND domain_name = $2 AND tld = $3 AND item_type = $4`,
      [req.user.id, domain_name.toLowerCase(), tld.toLowerCase(), item_type]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Domain already in cart' });
    }

    // Get pricing
    const pricingResult = await pool.query(
      'SELECT * FROM tld_pricing WHERE tld = $1 AND is_active = true',
      [tld]
    );

    if (pricingResult.rows.length === 0) {
      return res.status(400).json({ error: 'TLD not available' });
    }

    const pricing = pricingResult.rows[0];
    let price;

    switch (item_type) {
      case 'register':
        price = parseFloat(pricing.price_register) * years;
        break;
      case 'transfer':
        price = parseFloat(pricing.price_transfer);
        break;
      case 'renew':
        price = parseFloat(pricing.price_renew) * years;
        break;
      default:
        return res.status(400).json({ error: `Invalid item type: ${item_type}` });
    }

    // Add privacy cost if requested
    if (options.privacy) {
      price += parseFloat(pricing.price_privacy);
    }

    const result = await pool.query(
      `INSERT INTO cart_items (user_id, item_type, domain_name, tld, years, price, options)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, item_type, domain_name.toLowerCase(), tld.toLowerCase(), years, price, JSON.stringify(options)]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// Update cart item
router.put('/:itemId', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const itemId = parseInt(req.params.itemId, 10);
  const { years, options } = req.body;

  // Validate itemId
  if (isNaN(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  try {
    // Get current item
    const itemResult = await pool.query(
      'SELECT * FROM cart_items WHERE id = $1 AND user_id = $2',
      [itemId, req.user.id]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    const item = itemResult.rows[0];

    // Recalculate price if years changed
    let newPrice = item.price;
    if (years && years !== item.years) {
      const pricingResult = await pool.query(
        'SELECT * FROM tld_pricing WHERE tld = $1',
        [item.tld]
      );

      if (pricingResult.rows.length > 0) {
        const pricing = pricingResult.rows[0];
        // Transfer items don't support year changes
        if (item.item_type === 'transfer') {
          return res.status(400).json({ error: 'Cannot change years for transfer items' });
        }
        const basePrice = item.item_type === 'register'
          ? pricing.price_register
          : pricing.price_renew;
        newPrice = parseFloat(basePrice) * years;

        const currentOptions = item.options || {};
        if (currentOptions.privacy || options?.privacy) {
          newPrice += parseFloat(pricing.price_privacy);
        }
      }
    }

    const result = await pool.query(
      `UPDATE cart_items
       SET years = COALESCE($1, years),
           options = COALESCE($2, options),
           price = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [years, options ? JSON.stringify(options) : null, newPrice, itemId, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating cart item:', error);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// Remove item from cart
router.delete('/:itemId', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const itemId = parseInt(req.params.itemId, 10);

  // Validate itemId
  if (isNaN(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
      [itemId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Error removing cart item:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// Clear cart
router.delete('/', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;
