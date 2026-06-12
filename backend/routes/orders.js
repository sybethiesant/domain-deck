const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authMiddleware, parseIntParam } = require('../middleware/auth');
const enomService = require('../services/enom');
const stripeService = require('../services/stripe');

// Generate order number
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `WX-${timestamp}-${random}`;
}

// Get user's orders
router.get('/', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  // Validate and bound pagination parameters
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.subtotal, o.tax, o.total,
              o.payment_status, o.created_at, o.processed_at,
              COUNT(oi.id) as item_count
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM orders WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order details
router.get('/:id', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseIntParam(req.params.id);

  if (orderId === null) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  try {
    // Get order
    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const itemsResult = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`,
      [orderId]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order from cart (checkout)
router.post('/checkout', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const { payment_intent_id, billing_address, registrant_contact, auto_renew = true, extended_attributes = {} } = req.body;

  try {
    // Validate registrant_contact for domain registrations
    const requiredContactFields = ['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'state', 'postal_code'];
    if (!registrant_contact) {
      return res.status(400).json({ error: 'Registrant contact information is required for domain purchases' });
    }

    const missingFields = requiredContactFields.filter(field => !registrant_contact[field]?.trim());
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required contact fields',
        missing: missingFields
      });
    }

    // The payment intent id comes from the client, so it must be verified
    // against Stripe before it is trusted: it has to be this user's intent,
    // created for a domain purchase, not already consumed, and not already
    // attached to another order — otherwise a small or reused intent could be
    // paired with a large order (pay-less-than-owed).
    if (!payment_intent_id || typeof payment_intent_id !== 'string' || !payment_intent_id.startsWith('pi_')) {
      return res.status(400).json({ error: 'A valid payment intent is required' });
    }
    if (!stripeService.isConfigured()) {
      return res.status(503).json({ error: 'Payment processing not configured' });
    }
    const stripe = stripeService.getInstance();
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    } catch (piError) {
      return res.status(400).json({ error: 'Payment intent not found' });
    }
    if (paymentIntent.metadata?.userId !== String(req.user.id) || paymentIntent.metadata?.type !== 'domain_purchase') {
      return res.status(403).json({ error: 'Payment intent does not belong to this checkout' });
    }
    if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'canceled') {
      return res.status(400).json({ error: `Payment intent cannot be used (status: ${paymentIntent.status})` });
    }
    const existingOrder = await pool.query(
      'SELECT id FROM orders WHERE stripe_payment_intent_id = $1',
      [payment_intent_id]
    );
    if (existingOrder.rows.length > 0) {
      return res.status(409).json({ error: 'Payment intent is already associated with another order' });
    }

    // Get cart items
    const cartResult = await pool.query(
      `SELECT * FROM cart_items
       WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [req.user.id]
    );

    if (cartResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const items = cartResult.rows;

    // All money math in integer cents — float accumulation drifts off the
    // amount Stripe actually charges.
    const subtotalCents = items.reduce((sum, item) => sum + Math.round(parseFloat(item.price) * 100), 0);

    // Calculate tax from settings
    let taxCents = 0;
    try {
      const taxSettingsResult = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('tax_enabled', 'tax_rate', 'tax_inclusive')"
      );
      const taxSettings = {};
      for (const row of taxSettingsResult.rows) {
        taxSettings[row.key] = row.value;
      }

      if (taxSettings.tax_enabled === 'true') {
        const taxRate = parseFloat(taxSettings.tax_rate || 0) / 100;
        if (taxSettings.tax_inclusive === 'true') {
          // Tax is included in price, calculate it out for display
          taxCents = Math.round(subtotalCents - subtotalCents / (1 + taxRate));
        } else {
          // Tax is added on top
          taxCents = Math.round(subtotalCents * taxRate);
        }
      }
    } catch (taxError) {
      console.error('Error calculating tax:', taxError.message);
    }

    const totalCents = subtotalCents + Math.max(0, taxCents);
    const subtotal = subtotalCents / 100;
    const tax = taxCents / 100;
    const total = totalCents / 100;

    // The intent was created from the raw cart total before tax — bring the
    // Stripe charge into lockstep with the order total so the webhook's
    // amount validation always agrees with what the customer pays.
    if (paymentIntent.amount !== totalCents) {
      await stripe.paymentIntents.update(payment_intent_id, { amount: totalCents });
    }

    // Create the order, its items, and clear the cart atomically — a partial
    // failure must not leave a paid-for order with missing items or a cart
    // that re-bills the customer.
    const client = await pool.connect();
    let order;
    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `INSERT INTO orders (
          user_id, order_number, status, subtotal, tax, total,
          stripe_payment_intent_id, payment_status, billing_address, registrant_contact, auto_renew, extended_attributes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          req.user.id,
          generateOrderNumber(),
          'pending',
          subtotal,
          tax,
          total,
          payment_intent_id,
          'pending',
          JSON.stringify(billing_address || {}),
          JSON.stringify(registrant_contact),
          auto_renew,
          JSON.stringify(extended_attributes || {})
        ]
      );

      order = orderResult.rows[0];

      // Create order items
      for (const item of items) {
        // Calculate unit price correctly: for multi-year purchases, divide by years; otherwise use total
        const itemYears = parseInt(item.years) || 1;
        const unitPrice = itemYears > 1 ? parseFloat(item.price) / itemYears : parseFloat(item.price);

        await client.query(
          `INSERT INTO order_items (
            order_id, item_type, domain_name, tld, years,
            unit_price, quantity, total_price, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            order.id,
            item.item_type,
            item.domain_name,
            item.tld,
            itemYears,
            unitPrice,
            itemYears,
            parseFloat(item.price),
            'pending'
          ]
        );
      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, 'order_created', 'order', order.id, JSON.stringify({ total, itemCount: items.length })]
    );

    res.status(201).json({
      message: 'Order created successfully',
      order: {
        ...order,
        items: items.map(i => ({
          domain_name: i.domain_name,
          item_type: i.item_type,
          price: i.price
        }))
      }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Retry failed order item
router.post('/:orderId/items/:itemId/retry', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseIntParam(req.params.orderId);
  const itemId = parseIntParam(req.params.itemId);

  if (orderId === null || itemId === null) {
    return res.status(400).json({ error: 'Invalid order ID or item ID' });
  }

  try {
    // Verify ownership
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get item
    const itemResult = await pool.query(
      'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    const item = itemResult.rows[0];

    if (item.status !== 'failed') {
      return res.status(400).json({ error: 'Can only retry failed items' });
    }

    // Set status to processing before retry attempt
    await pool.query(
      `UPDATE order_items SET status = 'processing', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [parseInt(itemId)]
    );

    const fullDomain = `${item.domain_name}.${item.tld}`;
    let result;

    try {
      // Call appropriate eNom API based on item type
      switch (item.item_type) {
        case 'register':
          // Get registrant contact from the order
          const orderData = orderResult.rows[0];
          const registrantContact = orderData.registrant_contact || {};

          result = await enomService.registerDomain(
            item.domain_name,
            item.tld,
            item.years || 1,
            registrantContact
          );
          break;

        case 'transfer':
          // Transfers need EPP/auth code - check if stored or require user input
          // Parse options if it's a JSON string
          let transferOptions = item.options;
          if (typeof transferOptions === 'string') {
            try {
              transferOptions = JSON.parse(transferOptions);
            } catch (e) {
              transferOptions = {};
            }
          }
          if (!transferOptions?.auth_code) {
            await pool.query(
              `UPDATE order_items SET status = 'failed', error_message ='Authorization code required for transfer retry', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1`,
              [parseInt(itemId)]
            );
            return res.status(400).json({ error: 'Authorization code required. Please contact support.' });
          }
          result = await enomService.initiateTransfer(
            item.domain_name,
            item.tld,
            transferOptions.auth_code
          );
          break;

        case 'renew':
          result = await enomService.renewDomain(
            item.domain_name,
            item.tld,
            item.years || 1
          );
          break;

        default:
          await pool.query(
            `UPDATE order_items SET status = 'failed', error_message ='Unknown item type', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [parseInt(itemId)]
          );
          return res.status(400).json({ error: `Unknown item type: ${item.item_type}` });
      }

      // Success - update status
      await pool.query(
        `UPDATE order_items SET
          status = 'completed',
          enom_order_id = $1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [result?.orderId || null, parseInt(itemId)]
      );

      res.json({
        message: 'Retry successful',
        domain: fullDomain,
        result
      });

    } catch (enomError) {
      // Retry failed - update with error
      await pool.query(
        `UPDATE order_items SET
          status = 'failed',
          error_message = $1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [enomError.message || 'eNom API error', parseInt(itemId)]
      );
      return res.status(500).json({
        error: 'Retry failed',
        details: enomError.message
      });
    }
  } catch (error) {
    console.error('Error retrying order item:', error);
    res.status(500).json({ error: 'Failed to retry' });
  }
});

module.exports = router;
