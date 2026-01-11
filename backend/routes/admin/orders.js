/**
 * Admin Order Management Routes
 * Order listing, details, status updates, and retry functionality
 */
const express = require('express');
const router = express.Router();
const { logAudit } = require('../../middleware/auth');
const enom = require('../../services/enom');

// List all orders
router.get('/orders', async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    page = 1,
    limit = 50,
    status,
    payment_status,
    search,
    start_date,
    end_date,
    sort = 'created_at',
    order = 'desc'
  } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const allowedSorts = ['created_at', 'total', 'order_number'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let query = `
      SELECT o.*, u.username, u.email, u.full_name,
             COUNT(oi.id) as item_count,
             SUM(CASE WHEN oi.status = 'completed' THEN 1 ELSE 0 END) as completed_items,
             SUM(CASE WHEN oi.status = 'failed' THEN 1 ELSE 0 END) as failed_items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }

    if (payment_status) {
      params.push(payment_status);
      query += ` AND o.payment_status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (o.order_number ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
    }

    if (start_date) {
      params.push(start_date);
      query += ` AND o.created_at >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND o.created_at <= $${params.length}`;
    }

    query += ` GROUP BY o.id, u.username, u.email, u.full_name ORDER BY o.${sortColumn} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM orders o WHERE 1=1';
    const countParams = [];
    if (status) {
      countParams.push(status);
      countQuery += ` AND o.status = $${countParams.length}`;
    }
    if (payment_status) {
      countParams.push(payment_status);
      countQuery += ` AND o.payment_status = $${countParams.length}`;
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get order details
router.get('/orders/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseInt(req.params.id);

  try {
    // Get order with user info
    const orderResult = await pool.query(
      `SELECT o.*, u.username, u.email, u.full_name, u.phone, u.company_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items with domain status
    const itemsResult = await pool.query(
      `SELECT oi.*, d.status as domain_status, d.expiration_date as domain_expiration
       FROM order_items oi
       LEFT JOIN domains d ON oi.domain_id = d.id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at`,
      [orderId]
    );

    // Get staff notes
    const notesResult = await pool.query(
      `SELECT sn.*, u.username as staff_username
       FROM staff_notes sn
       LEFT JOIN users u ON sn.staff_user_id = u.id
       WHERE sn.entity_type = 'order' AND sn.entity_id = $1
       ORDER BY sn.is_pinned DESC, sn.created_at DESC`,
      [orderId]
    );

    // Get audit history for this order
    const auditResult = await pool.query(
      `SELECT al.*, u.username
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.entity_type = 'order' AND al.entity_id = $1
       ORDER BY al.created_at DESC
       LIMIT 20`,
      [orderId]
    );

    res.json({
      ...orderResult.rows[0],
      items: itemsResult.rows,
      notes: notesResult.rows,
      auditHistory: auditResult.rows
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Update order status
router.put('/orders/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseInt(req.params.id);
  const { status, payment_status, notes } = req.body;

  try {
    const currentOrder = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (currentOrder.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const oldValues = {
      status: currentOrder.rows[0].status,
      payment_status: currentOrder.rows[0].payment_status
    };

    const result = await pool.query(
      `UPDATE orders SET
        status = COALESCE($1, status),
        payment_status = COALESCE($2, payment_status),
        notes = COALESCE($3, notes),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [status, payment_status, notes, orderId]
    );

    await logAudit(pool, req.user.id, 'update_order', 'order', orderId, oldValues, { status, payment_status }, req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Retry failed registration for an order item
router.post('/orders/:orderId/items/:itemId/retry', async (req, res) => {
  const pool = req.app.locals.pool;
  const { orderId, itemId } = req.params;

  try {
    // Get the order item
    const itemResult = await pool.query(
      `SELECT oi.*, o.user_id FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.id = $1 AND oi.order_id = $2`,
      [itemId, orderId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    const item = itemResult.rows[0];

    if (item.status !== 'failed') {
      return res.status(400).json({ error: 'Can only retry failed items' });
    }

    // Get user's default contact
    const contactResult = await pool.query(
      `SELECT * FROM domain_contacts WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [item.user_id]
    );

    let contact = contactResult.rows[0];

    // Fall back to user profile if no contact
    if (!contact) {
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [item.user_id]);
      const u = userResult.rows[0];
      contact = {
        first_name: u.full_name?.split(' ')[0] || u.username,
        last_name: u.full_name?.split(' ').slice(1).join(' ') || u.username,
        organization: u.company_name || '',
        email: u.email,
        phone: u.phone || '+1.5555551234',
        address_line1: u.address_line1 || '123 Main St',
        city: u.city || 'New York',
        state: u.state || 'NY',
        postal_code: u.postal_code || '10001',
        country: u.country || 'US'
      };
    }

    // Parse domain
    const parts = item.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    let result;
    if (item.item_type === 'register') {
      result = await enom.registerDomain({
        sld,
        tld,
        years: item.years,
        registrant: {
          firstName: contact.first_name,
          lastName: contact.last_name,
          organization: contact.organization,
          email: contact.email,
          phone: contact.phone,
          address1: contact.address_line1,
          city: contact.city,
          state: contact.state,
          postalCode: contact.postal_code,
          country: contact.country
        }
      });

      // Create domain record
      if (result.success) {
        await pool.query(
          `INSERT INTO domains (user_id, domain_name, tld, status, enom_order_id)
           VALUES ($1, $2, $3, 'active', $4)
           ON CONFLICT (domain_name) DO UPDATE SET status = 'active', enom_order_id = $4`,
          [item.user_id, `${sld}.${tld}`, tld, result.orderId]
        );
      }
    } else if (item.item_type === 'renew') {
      result = await enom.renewDomain(sld, tld, item.years);
    } else if (item.item_type === 'transfer') {
      // Get transfer auth code if stored
      const transferResult = await pool.query(
        'SELECT auth_code FROM domain_transfers WHERE order_item_id = $1',
        [item.id]
      );
      const authCode = transferResult.rows[0]?.auth_code || '';

      result = await enom.initiateTransfer({
        sld,
        tld,
        authCode,
        registrant: {
          firstName: contact.first_name,
          lastName: contact.last_name,
          organization: contact.organization,
          email: contact.email,
          phone: contact.phone,
          address1: contact.address_line1,
          city: contact.city,
          state: contact.state,
          postalCode: contact.postal_code,
          country: contact.country
        }
      });
    }

    // Update the order item
    await pool.query(
      `UPDATE order_items SET
        status = 'completed',
        enom_order_id = $1,
        enom_status = 'success',
        enom_response = $2,
        processed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [result.orderId || result.transferOrderId, JSON.stringify(result), itemId]
    );

    // Check if all items are now completed
    const remainingFailed = await pool.query(
      `SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND status = 'failed'`,
      [orderId]
    );

    if (parseInt(remainingFailed.rows[0].count) === 0) {
      await pool.query(
        `UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [orderId]
      );
    }

    await logAudit(pool, req.user.id, 'retry_registration', 'order_item', parseInt(itemId), { status: 'failed' }, { status: 'completed' }, req);

    res.json({ success: true, result });
  } catch (error) {
    console.error('Error retrying registration:', error);
    res.status(500).json({ error: 'Failed to retry registration' });
  }
});

// Refund order (requires Stripe)
router.post('/orders/:id/refund', async (req, res) => {
  const pool = req.app.locals.pool;
  const orderId = parseInt(req.params.id);
  const { amount, reason } = req.body;

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    if (order.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Order is not paid' });
    }

    if (!order.stripe_payment_intent_id) {
      return res.status(400).json({ error: 'No payment intent found for this order' });
    }

    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    // Create refund
    const refundAmount = amount ? Math.round(amount * 100) : undefined;
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: refundAmount,
      reason: 'requested_by_customer'
    });

    // Update order
    const isFullRefund = !amount || amount >= order.total;
    await pool.query(
      `UPDATE orders SET
        payment_status = $1,
        status = $2,
        notes = COALESCE(notes, '') || $3,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [
        isFullRefund ? 'refunded' : 'partial_refund',
        isFullRefund ? 'refunded' : order.status,
        `\n[Refund ${new Date().toISOString()}] Amount: $${(refund.amount / 100).toFixed(2)}. Reason: ${reason || 'Not specified'}`,
        orderId
      ]
    );

    await logAudit(pool, req.user.id, 'refund_order', 'order', orderId,
      { payment_status: 'paid' },
      { payment_status: isFullRefund ? 'refunded' : 'partial_refund', refund_amount: refund.amount / 100 },
      req
    );

    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status
      }
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

module.exports = router;
