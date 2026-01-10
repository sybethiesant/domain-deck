const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Initialize Stripe (only if key is configured)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Get Stripe config
router.get('/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    configured: !!stripe
  });
});

// Create payment intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment processing not configured' });
  }

  const pool = req.app.locals.pool;
  const { billing_address } = req.body;

  try {
    // Get cart total
    const cartResult = await pool.query(
      `SELECT SUM(price) as total FROM cart_items
       WHERE user_id = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [req.user.id]
    );

    if (!cartResult.rows[0].total) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const total = parseFloat(cartResult.rows[0].total);
    const amountInCents = Math.round(total * 100);

    // Get or create Stripe customer
    const userResult = await pool.query(
      'SELECT stripe_customer_id, email FROM users WHERE id = $1',
      [req.user.id]
    );

    let customerId = userResult.rows[0].stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userResult.rows[0].email,
        metadata: { userId: req.user.id.toString() }
      });
      customerId = customer.id;

      await pool.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId: req.user.id.toString(),
        type: 'domain_purchase'
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: total
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const pool = req.app.locals.pool;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(pool, event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(pool, event.data.object);
        break;

      case 'charge.refunded':
        await handleRefund(pool, event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handlePaymentSuccess(pool, paymentIntent) {
  const { id: paymentIntentId, metadata } = paymentIntent;

  // Update order payment status
  const orderResult = await pool.query(
    `UPDATE orders
     SET payment_status = 'paid',
         stripe_charge_id = $1,
         status = 'processing',
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_payment_intent_id = $2
     RETURNING *`,
    [paymentIntent.latest_charge, paymentIntentId]
  );

  if (orderResult.rows.length === 0) {
    console.error('Order not found for payment intent:', paymentIntentId);
    return;
  }

  const order = orderResult.rows[0];

  // TODO: Process domain registrations/transfers via eNom API
  // For now, mark items as processing
  await pool.query(
    `UPDATE order_items SET status = 'processing' WHERE order_id = $1`,
    [order.id]
  );

  // Log activity
  await pool.query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [order.user_id, 'payment_received', 'order', order.id, JSON.stringify({ amount: paymentIntent.amount / 100 })]
  );

  console.log('Payment succeeded for order:', order.order_number);
}

async function handlePaymentFailure(pool, paymentIntent) {
  const { id: paymentIntentId } = paymentIntent;

  await pool.query(
    `UPDATE orders
     SET payment_status = 'failed',
         status = 'failed',
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );

  console.log('Payment failed for intent:', paymentIntentId);
}

async function handleRefund(pool, charge) {
  const { payment_intent: paymentIntentId } = charge;

  await pool.query(
    `UPDATE orders
     SET payment_status = 'refunded',
         status = 'refunded',
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );

  console.log('Refund processed for intent:', paymentIntentId);
}

// Get saved payment methods
router.get('/payment-methods', authMiddleware, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const pool = req.app.locals.pool;

  try {
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    const customerId = userResult.rows[0]?.stripe_customer_id;

    if (!customerId) {
      return res.json({ paymentMethods: [] });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card'
    });

    res.json({
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year
      }))
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

module.exports = router;
