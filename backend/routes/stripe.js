const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const enom = require('../services/enom');

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

// Create payment intent for WHOIS privacy purchase
router.post('/privacy-purchase', authMiddleware, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment processing not configured' });
  }

  const pool = req.app.locals.pool;
  const { domain_id } = req.body;

  if (!domain_id) {
    return res.status(400).json({ error: 'Domain ID is required' });
  }

  try {
    // Verify domain ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domain_id, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Check if privacy is already purchased
    const privacyStatus = await enom.getPrivacyStatus(sld, tld);
    if (!privacyStatus.willCharge) {
      return res.status(400).json({
        error: 'Privacy is already purchased for this domain',
        privacyStatus
      });
    }

    // Get privacy price from TLD pricing
    const pricingResult = await pool.query(
      'SELECT price_privacy FROM tld_pricing WHERE tld = $1',
      [tld]
    );

    const privacyPrice = pricingResult.rows[0]?.price_privacy || 9.99;
    const amountInCents = Math.round(privacyPrice * 100);

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

    // Create payment intent for privacy purchase
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId: req.user.id.toString(),
        type: 'privacy_purchase',
        domainId: domain_id.toString(),
        domainName: domain.domain_name,
        sld: sld,
        tld: tld
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: privacyPrice,
      domainName: domain.domain_name,
      privacyStatus
    });
  } catch (error) {
    console.error('Error creating privacy payment intent:', error);
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
    // SECURITY: Always require webhook signature verification
    if (!webhookSecret) {
      console.error('CRITICAL: STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
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

/**
 * Handle successful payment - process domain registrations/transfers/renewals
 */
async function handlePaymentSuccess(pool, paymentIntent) {
  const { id: paymentIntentId, metadata } = paymentIntent;

  console.log('Processing payment success:', paymentIntentId, 'type:', metadata?.type);

  // Handle privacy purchase separately
  if (metadata?.type === 'privacy_purchase') {
    await handlePrivacyPurchaseSuccess(pool, paymentIntent);
    return;
  }

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
  console.log('Processing order:', order.order_number);

  // Get order items
  const itemsResult = await pool.query(
    `SELECT * FROM order_items WHERE order_id = $1`,
    [order.id]
  );

  // Get registrant contact from order (stored during checkout)
  const storedContact = order.registrant_contact;

  // Validate that registrant contact was provided during checkout
  if (!storedContact || !storedContact.first_name || !storedContact.email || !storedContact.phone) {
    console.error('Order missing valid registrant contact:', order.order_number);
    throw new Error('Order is missing required registrant contact information');
  }

  // Format contact for eNom API
  const registrantContact = {
    firstName: storedContact.first_name,
    lastName: storedContact.last_name,
    organization: storedContact.organization || '',
    email: storedContact.email,
    phone: storedContact.phone,
    address1: storedContact.address_line1,
    address2: storedContact.address_line2 || '',
    city: storedContact.city,
    state: storedContact.state,
    postalCode: storedContact.postal_code,
    country: storedContact.country || 'US'
  };

  // Process each order item
  let allSucceeded = true;
  const results = [];

  for (const item of itemsResult.rows) {
    try {
      let result;

      if (item.item_type === 'register') {
        // Register new domain with smart refill
        console.log(`Registering domain: ${item.domain_name}.${item.tld} (cost: $${item.total_price})`);
        const smartResult = await enom.smartPurchase({
          sld: item.domain_name,
          tld: item.tld,
          years: item.years || 1,
          registrant: registrantContact,
          privacy: false,
          cost: parseFloat(item.total_price)
        });
        result = smartResult.purchaseResult || smartResult;

        // Log refill if it happened
        if (smartResult.refillResult) {
          console.log(`Auto-refilled $${smartResult.refillResult.requestedAmount} for domain purchase`);
          await pool.query(
            `INSERT INTO balance_transactions
             (transaction_type, amount, fee_amount, net_amount, domain_name, order_id, auto_refill, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['refill', smartResult.refillResult.requestedAmount, smartResult.refillResult.feeAmount,
             smartResult.refillResult.netAmount, item.domain_name + '.' + item.tld, order.id, true,
             'Auto-refill for domain registration']
          );
        }

        if (result.success) {
          // Create domain record in our database
          await pool.query(
            `INSERT INTO domains (
              user_id, domain_name, tld, status, expiration_date,
              auto_renew, enom_order_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            ON CONFLICT (domain_name, tld) DO UPDATE SET
              user_id = $1,
              status = $4,
              expiration_date = $5,
              enom_order_id = $7,
              updated_at = CURRENT_TIMESTAMP`,
            [
              order.user_id,
              item.domain_name,
              item.tld,
              'active',
              result.expirationDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              true,
              result.orderId
            ]
          );
        }

      } else if (item.item_type === 'transfer') {
        // Initiate domain transfer with smart refill
        console.log(`Initiating transfer: ${item.domain_name}.${item.tld} (cost: $${item.total_price})`);
        const smartResult = await enom.smartTransfer({
          sld: item.domain_name,
          tld: item.tld,
          authCode: item.auth_code || '',
          registrant: registrantContact,
          years: 1,
          cost: parseFloat(item.total_price)
        });
        result = smartResult.transferResult || smartResult;

        // Log refill if it happened
        if (smartResult.refillResult) {
          console.log(`Auto-refilled $${smartResult.refillResult.requestedAmount} for domain transfer`);
          await pool.query(
            `INSERT INTO balance_transactions
             (transaction_type, amount, fee_amount, net_amount, domain_name, order_id, auto_refill, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['refill', smartResult.refillResult.requestedAmount, smartResult.refillResult.feeAmount,
             smartResult.refillResult.netAmount, item.domain_name + '.' + item.tld, order.id, true,
             'Auto-refill for domain transfer']
          );
        }

        if (result.success) {
          // Create domain record with pending status
          await pool.query(
            `INSERT INTO domains (
              user_id, domain_name, tld, status, enom_order_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (domain_name, tld) DO UPDATE SET
              user_id = $1,
              status = $4,
              enom_order_id = $5,
              updated_at = CURRENT_TIMESTAMP`,
            [
              order.user_id,
              item.domain_name,
              item.tld,
              'transfer_pending',
              result.transferOrderId
            ]
          );
        }

      } else if (item.item_type === 'renew') {
        // Renew existing domain with smart refill
        console.log(`Renewing domain: ${item.domain_name}.${item.tld} (cost: $${item.total_price})`);
        const smartResult = await enom.smartRenewal(
          item.domain_name,
          item.tld,
          item.years || 1,
          parseFloat(item.total_price)
        );
        result = smartResult.renewResult || smartResult;

        // Log refill if it happened
        if (smartResult.refillResult) {
          console.log(`Auto-refilled $${smartResult.refillResult.requestedAmount} for domain renewal`);
          await pool.query(
            `INSERT INTO balance_transactions
             (transaction_type, amount, fee_amount, net_amount, domain_name, order_id, auto_refill, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            ['refill', smartResult.refillResult.requestedAmount, smartResult.refillResult.feeAmount,
             smartResult.refillResult.netAmount, item.domain_name + '.' + item.tld, order.id, true,
             'Auto-refill for domain renewal']
          );
        }

        if (result.success) {
          // Update domain expiration
          await pool.query(
            `UPDATE domains SET
              expiration_date = $1,
              status = 'active',
              updated_at = CURRENT_TIMESTAMP
             WHERE domain_name = $2 AND tld = $3`,
            [result.newExpiration, item.domain_name, item.tld]
          );
        }
      }

      // Update order item status
      await pool.query(
        `UPDATE order_items SET
          status = $1,
          enom_order_id = $2,
          processed_at = CURRENT_TIMESTAMP,
          error_message = NULL
         WHERE id = $3`,
        [
          'completed',
          result?.orderId || result?.transferOrderId || null,
          item.id
        ]
      );

      results.push({ itemId: item.id, success: true, result });

    } catch (error) {
      console.error(`Error processing item ${item.id}:`, error.message);
      allSucceeded = false;

      // Mark item as failed
      await pool.query(
        `UPDATE order_items SET
          status = 'failed',
          error_message = $1,
          processed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [error.message, item.id]
      );

      results.push({ itemId: item.id, success: false, error: error.message });
    }
  }

  // Update order status
  const finalStatus = allSucceeded ? 'completed' : 'partial';
  await pool.query(
    `UPDATE orders SET
      status = $1,
      processed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [finalStatus, order.id]
  );

  // Log activity
  await pool.query(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      order.user_id,
      'payment_processed',
      'order',
      order.id,
      JSON.stringify({
        amount: paymentIntent.amount / 100,
        status: finalStatus,
        results
      })
    ]
  );

  console.log(`Order ${order.order_number} processed: ${finalStatus}`);
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

/**
 * Handle successful privacy purchase payment
 */
async function handlePrivacyPurchaseSuccess(pool, paymentIntent) {
  const { id: paymentIntentId, metadata, amount } = paymentIntent;

  console.log('Processing privacy purchase:', paymentIntentId, 'for domain:', metadata.domainName);

  const { domainId, domainName, sld, tld, userId } = metadata;

  try {
    // Enable privacy via eNom
    await enom.setWhoisPrivacy(sld, tld, true);

    // Update domain record
    await pool.query(
      `UPDATE domains SET
        privacy_enabled = true,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [domainId]
    );

    // Log the transaction
    await pool.query(
      `INSERT INTO balance_transactions
       (transaction_type, amount, fee_amount, net_amount, domain_name, notes, stripe_payment_intent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        'privacy_purchase',
        amount / 100,
        0,
        amount / 100,
        domainName,
        'WHOIS Privacy Protection purchased',
        paymentIntentId
      ]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        'privacy_purchased',
        'domain',
        domainId,
        JSON.stringify({
          domainName,
          amount: amount / 100,
          paymentIntentId
        })
      ]
    );

    console.log(`Privacy enabled for ${domainName}`);
  } catch (error) {
    console.error('Error enabling privacy after payment:', error);
    // The payment succeeded but eNom failed - this should be logged for manual resolution
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        'privacy_purchase_failed',
        'domain',
        domainId,
        JSON.stringify({
          domainName,
          error: error.message,
          paymentIntentId,
          requiresManualResolution: true
        })
      ]
    );
    throw error;
  }
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

// Manual trigger for testing (admin only)
router.post('/process-order/:orderId', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  // Check if admin
  const userResult = await pool.query(
    'SELECT is_admin, role_level FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userResult.rows[0]?.is_admin && userResult.rows[0]?.role_level < 3) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Create mock payment intent object
    const mockPaymentIntent = {
      id: order.stripe_payment_intent_id || 'manual_' + Date.now(),
      latest_charge: 'manual',
      amount: Math.round(order.total * 100),
      metadata: { userId: order.user_id.toString() }
    };

    await handlePaymentSuccess(pool, mockPaymentIntent);

    res.json({ success: true, message: 'Order processed' });
  } catch (error) {
    console.error('Manual process error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
