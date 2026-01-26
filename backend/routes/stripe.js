const express = require('express');
const router = express.Router();
const { authMiddleware, ROLE_LEVELS } = require('../middleware/auth');
const enom = require('../services/enom');
const stripeService = require('../services/stripe');
const emailService = require('../services/email');
const { PRICING } = require('../config/constants');

// Get Stripe config
router.get('/config', (req, res) => {
  const mode = stripeService.getMode();
  res.json({
    publishableKey: mode.publishableKey,
    configured: mode.configured,
    mode: mode.mode
  });
});

// Create payment intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  if (!stripeService.isConfigured()) {
    return res.status(503).json({ error: 'Payment processing not configured' });
  }
  const stripe = stripeService.getInstance();

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

    // Create payment intent with setup_future_usage to save card for auto-renewal
    // Only allow payment methods that support off-session charges (auto-renewal)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      customer: customerId,
      setup_future_usage: 'off_session', // Save payment method for future charges
      metadata: {
        userId: req.user.id.toString(),
        type: 'domain_purchase'
      },
      // Payment methods that support off-session charges for auto-renewal
      payment_method_types: ['card', 'link', 'cashapp', 'amazon_pay']
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
  if (!stripeService.isConfigured()) {
    return res.status(503).json({ error: 'Payment processing not configured' });
  }
  const stripe = stripeService.getInstance();

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
    // Use the tld column directly - domain_name may or may not include the TLD
    const tld = domain.tld;
    // If domain_name ends with the TLD, strip it; otherwise use as-is
    // This properly handles multi-level TLDs like .co.uk
    let sld = domain.domain_name;
    if (sld.endsWith('.' + tld)) {
      sld = sld.slice(0, -(tld.length + 1));
    } else if (sld.includes('.')) {
      // Fallback: if domain_name has dots but doesn't end with TLD, strip last segment
      sld = sld.split('.').slice(0, -1).join('.');
    }

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

    const privacyPrice = pricingResult.rows[0]?.price_privacy || PRICING.DEFAULT_PRIVACY_PRICE;
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
      domainName: `${sld}.${tld}`,
      privacyStatus
    });
  } catch (error) {
    console.error('Privacy purchase error:', error);
    res.status(500).json({ error: 'Failed to initialize payment. Please try again.' });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req, res) => {
  if (!stripeService.isConfigured()) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = stripeService.getWebhookSecret();
  const pool = req.app.locals.pool;

  let event;

  try {
    // SECURITY: Always require webhook signature verification
    if (!webhookSecret) {
      console.error('CRITICAL: Stripe webhook secret not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }
    event = stripeService.constructWebhookEvent(req.body, sig);
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
 * Save payment method to database for future auto-renewals
 */
async function savePaymentMethodIfNew(pool, paymentIntent, userId) {
  try {
    const pmId = paymentIntent.payment_method;
    if (!pmId) return;

    // Check if already saved
    const existing = await pool.query(
      'SELECT id FROM saved_payment_methods WHERE stripe_payment_method_id = $1',
      [pmId]
    );
    if (existing.rows.length > 0) return;

    // Get payment method details from Stripe
    const pm = await stripeService.retrievePaymentMethod(pmId);
    if (!pm || pm.type !== 'card' || !pm.card) return;

    // Check if user has any saved methods
    const methodCount = await pool.query(
      'SELECT COUNT(*) as count FROM saved_payment_methods WHERE user_id = $1',
      [userId]
    );
    const isFirst = parseInt(methodCount.rows[0].count) === 0;

    // Save to database
    await pool.query(
      `INSERT INTO saved_payment_methods
       (user_id, stripe_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (stripe_payment_method_id) DO NOTHING`,
      [userId, pmId, pm.card.brand, pm.card.last4, pm.card.exp_month, pm.card.exp_year, isFirst]
    );

    // If first card, also set as default on user
    if (isFirst) {
      await pool.query(
        'UPDATE users SET default_payment_method_id = $1 WHERE id = $2',
        [pmId, userId]
      );
    }

  } catch (error) {
    console.error('Error saving payment method:', error.message);
    // Don't throw - this is not critical to order processing
  }
}

/**
 * Handle successful payment - process domain registrations/transfers/renewals
 */
async function handlePaymentSuccess(pool, paymentIntent) {
  const { id: paymentIntentId, metadata } = paymentIntent;

  // Save payment method for future use (auto-renewal)
  if (metadata?.userId) {
    await savePaymentMethodIfNew(pool, paymentIntent, parseInt(metadata.userId));
  }

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

  // Get extended attributes for ccTLDs (e.g., .in requires Aadhaar/PAN)
  const storedExtendedAttributes = order.extended_attributes || {};

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
        // Extract extended attributes for this domain's TLD
        // Frontend stores as: { "in_in_aadharnumber": "value", "uk_legal_type": "IND" }
        // We need to extract attrs for this specific TLD: { "in_aadharnumber": "value" }
        const domainExtendedAttrs = {};
        const tldPrefix = `${item.tld.toLowerCase()}_`;
        Object.entries(storedExtendedAttributes).forEach(([key, value]) => {
          if (key.toLowerCase().startsWith(tldPrefix) && value) {
            // Remove TLD prefix from key: "in_in_aadharnumber" -> "in_aadharnumber"
            const attrName = key.substring(tldPrefix.length);
            domainExtendedAttrs[attrName] = value;
          }
        });

        if (Object.keys(domainExtendedAttrs).length > 0) {
          console.log(`Extended attributes for ${item.domain_name}.${item.tld}:`, domainExtendedAttrs);
        }

        // Register new domain with smart refill
        console.log(`Registering domain: ${item.domain_name}.${item.tld} (cost: $${item.total_price})`);
        const smartResult = await enom.smartPurchase({
          sld: item.domain_name,
          tld: item.tld,
          years: item.years || 1,
          nameservers: ['dns1.name-services.com', 'dns2.name-services.com', 'dns3.name-services.com', 'dns4.name-services.com'],
          registrant: registrantContact,
          privacy: false,
          cost: parseFloat(item.total_price),
          extendedAttributes: domainExtendedAttrs
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
          // Save payment method for auto-renewal if user opted in
          const autoRenew = order.auto_renew !== false; // Default to true if not set
          const paymentMethodId = autoRenew ? paymentIntent.payment_method : null;

          await pool.query(
            `INSERT INTO domains (
              user_id, domain_name, tld, status, expiration_date,
              auto_renew, auto_renew_payment_method_id, enom_order_id, enom_mode, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
            ON CONFLICT (domain_name, tld) DO UPDATE SET
              user_id = $1,
              status = $4,
              expiration_date = $5,
              auto_renew = $6,
              auto_renew_payment_method_id = $7,
              enom_order_id = $8,
              enom_mode = $9,
              updated_at = CURRENT_TIMESTAMP`,
            [
              order.user_id,
              item.domain_name,
              item.tld,
              'active',
              result.expirationDate || new Date(Date.now() + (item.years || 1) * 365 * 24 * 60 * 60 * 1000),
              autoRenew,
              paymentMethodId,
              result.orderId,
              enom.getMode().mode
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
          // Save payment method for auto-renewal if user opted in
          const autoRenew = order.auto_renew !== false;
          const paymentMethodId = autoRenew ? paymentIntent.payment_method : null;

          await pool.query(
            `INSERT INTO domains (
              user_id, domain_name, tld, status, auto_renew, auto_renew_payment_method_id, enom_order_id, enom_mode, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            ON CONFLICT (domain_name, tld) DO UPDATE SET
              user_id = $1,
              status = $4,
              auto_renew = $5,
              auto_renew_payment_method_id = $6,
              enom_order_id = $7,
              enom_mode = $8,
              updated_at = CURRENT_TIMESTAMP`,
            [
              order.user_id,
              item.domain_name,
              item.tld,
              'transfer_pending',
              autoRenew,
              paymentMethodId,
              result.transferOrderId,
              enom.getMode().mode
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
          // Get expiration date - from result or fetch from eNom if not returned
          let newExpiration = result.newExpiration;
          if (!newExpiration) {
            console.log(`Expiration not in renewal response, fetching from eNom...`);
            try {
              const domainInfo = await enom.getDomainInfo(item.domain_name, item.tld);
              newExpiration = domainInfo.expirationDate;
            } catch (e) {
              console.error('Failed to fetch expiration after renewal:', e.message);
            }
          }

          // Update domain expiration and auto-renew settings
          const autoRenew = order.auto_renew !== false;
          const paymentMethodId = autoRenew ? paymentIntent.payment_method : null;

          if (newExpiration) {
            await pool.query(
              `UPDATE domains SET
                expiration_date = $1,
                status = 'active',
                auto_renew = $2,
                auto_renew_payment_method_id = COALESCE($3, auto_renew_payment_method_id),
                updated_at = CURRENT_TIMESTAMP
               WHERE domain_name = $4 AND tld = $5`,
              [newExpiration, autoRenew, paymentMethodId, item.domain_name, item.tld]
            );
          } else {
            // Still update auto-renew settings even without new expiration
            await pool.query(
              `UPDATE domains SET
                auto_renew = $1,
                auto_renew_payment_method_id = COALESCE($2, auto_renew_payment_method_id),
                updated_at = CURRENT_TIMESTAMP
               WHERE domain_name = $3 AND tld = $4`,
              [autoRenew, paymentMethodId, item.domain_name, item.tld]
            );
          }
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

  // Send email notifications
  try {
    // Get customer email
    const userResult = await pool.query('SELECT email, username FROM users WHERE id = $1', [order.user_id]);
    const customerEmail = userResult.rows[0]?.email;
    const customerUsername = userResult.rows[0]?.username || 'Customer';

    if (customerEmail) {
      // Send order confirmation to customer
      await emailService.sendOrderConfirmation(customerEmail, {
        orderNumber: order.order_number,
        items: itemsResult.rows,
        total: order.total,
        username: customerUsername
      });
      console.log(`Order confirmation email sent to ${customerEmail}`);

      // Send domain registered emails for each successfully registered domain
      for (const item of itemsResult.rows) {
        if (item.item_type === 'register') {
          const domainName = `${item.domain_name}.${item.tld}`;
          const expDate = new Date(Date.now() + (item.years || 1) * 365 * 24 * 60 * 60 * 1000);
          await emailService.sendDomainRegistered(customerEmail, {
            domain: domainName,
            expirationDate: expDate.toLocaleDateString(),
            username: customerUsername
          });
        } else if (item.item_type === 'transfer') {
          const domainName = `${item.domain_name}.${item.tld}`;
          await emailService.sendTransferInitiated(customerEmail, {
            domain: domainName,
            authEmail: customerEmail,
            username: customerUsername
          });
        }
      }
    }

    // Send admin notification
    const adminSettings = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('admin_notification_email', 'admin_email_notifications', 'notify_on_new_order')"
    );
    const settings = {};
    for (const row of adminSettings.rows) {
      settings[row.key] = row.value;
    }

    if (settings.admin_email_notifications !== 'false' && settings.notify_on_new_order !== 'false' && settings.admin_notification_email) {
      await emailService.sendAdminNewOrder(settings.admin_notification_email, {
        orderNumber: order.order_number,
        customerEmail: customerEmail,
        total: order.total,
        itemCount: itemsResult.rows.length
      });
      console.log(`Admin notification sent to ${settings.admin_notification_email}`);
    }
  } catch (emailError) {
    // Don't fail the order if email fails
    console.error('Error sending order emails:', emailError.message);
  }
}

async function handlePaymentFailure(pool, paymentIntent) {
  const { id: paymentIntentId } = paymentIntent;

  // Get order info before updating
  const orderResult = await pool.query(
    `SELECT o.*, u.email as customer_email, u.username
     FROM orders o
     LEFT JOIN users u ON o.user_id = u.id
     WHERE o.stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );

  await pool.query(
    `UPDATE orders
     SET payment_status = 'failed',
         status = 'failed',
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntentId]
  );

  console.log('Payment failed for intent:', paymentIntentId);

  // Send failure notification emails
  if (orderResult.rows.length > 0) {
    const order = orderResult.rows[0];

    try {
      // Get order items
      const itemsResult = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1',
        [order.id]
      );

      // Send to customer
      if (order.customer_email) {
        await emailService.sendOrderFailed(order.customer_email, {
          orderNumber: order.order_number,
          items: itemsResult.rows,
          error: 'Payment was declined',
          username: order.username || 'Customer'
        });
      }

      // Send admin notification
      const adminSettings = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('admin_notification_email', 'admin_email_notifications', 'notify_on_failed_order')"
      );
      const settings = {};
      for (const row of adminSettings.rows) {
        settings[row.key] = row.value;
      }

      if (settings.admin_email_notifications !== 'false' && settings.notify_on_failed_order !== 'false' && settings.admin_notification_email) {
        await emailService.sendAdminOrderFailed(settings.admin_notification_email, {
          orderNumber: order.order_number,
          customerEmail: order.customer_email,
          error: 'Payment declined',
          itemCount: itemsResult.rows.length
        });
      }
    } catch (emailError) {
      console.error('Error sending failure emails:', emailError.message);
    }
  }
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
    // Purchase privacy via eNom (this buys AND enables ID Protect)
    await enom.purchasePrivacy(sld, tld, 1);

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
  if (!stripeService.isConfigured()) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const pool = req.app.locals.pool;

  try {
    // Get from our database (includes is_default flag)
    const methodsResult = await pool.query(
      `SELECT stripe_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, is_default
       FROM saved_payment_methods
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    res.json({
      paymentMethods: methodsResult.rows.map(pm => ({
        id: pm.stripe_payment_method_id,
        brand: pm.card_brand,
        last4: pm.card_last4,
        expMonth: pm.card_exp_month,
        expYear: pm.card_exp_year,
        isDefault: pm.is_default
      }))
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// Set default payment method
router.put('/payment-methods/:pmId/default', authMiddleware, async (req, res) => {
  if (!stripeService.isConfigured()) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const pool = req.app.locals.pool;
  const { pmId } = req.params;

  try {
    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id FROM saved_payment_methods WHERE stripe_payment_method_id = $1 AND user_id = $2',
      [pmId, req.user.id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Clear all defaults for this user
    await pool.query(
      'UPDATE saved_payment_methods SET is_default = false WHERE user_id = $1',
      [req.user.id]
    );

    // Set new default
    await pool.query(
      'UPDATE saved_payment_methods SET is_default = true WHERE stripe_payment_method_id = $1',
      [pmId]
    );

    // Update user's default payment method
    await pool.query(
      'UPDATE users SET default_payment_method_id = $1 WHERE id = $2',
      [pmId, req.user.id]
    );

    // Also update on Stripe customer
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows[0]?.stripe_customer_id) {
      await stripeService.updateCustomer(userResult.rows[0].stripe_customer_id, {
        invoice_settings: { default_payment_method: pmId }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    res.status(500).json({ error: 'Failed to set default payment method' });
  }
});

// Delete payment method
router.delete('/payment-methods/:pmId', authMiddleware, async (req, res) => {
  if (!stripeService.isConfigured()) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const pool = req.app.locals.pool;
  const { pmId } = req.params;

  try {
    // Verify ownership
    const ownerCheck = await pool.query(
      'SELECT id, is_default FROM saved_payment_methods WHERE stripe_payment_method_id = $1 AND user_id = $2',
      [pmId, req.user.id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    // Detach from Stripe customer (ignore errors if already deleted from Stripe)
    try {
      await stripeService.detachPaymentMethod(pmId);
    } catch (stripeError) {
      // If payment method doesn't exist in Stripe, that's fine - still delete from our DB
      // This can happen if the card was removed directly in Stripe dashboard
      // or if it was created on a different Stripe account
      if (stripeError.code !== 'resource_missing') {
        throw stripeError; // Re-throw other errors
      }
      console.log(`Payment method ${pmId} not found in Stripe, removing from database only`);
    }

    // Delete from database
    await pool.query(
      'DELETE FROM saved_payment_methods WHERE stripe_payment_method_id = $1',
      [pmId]
    );

    // If this was the default, clear user's default
    if (ownerCheck.rows[0].is_default) {
      await pool.query(
        'UPDATE users SET default_payment_method_id = NULL WHERE id = $1',
        [req.user.id]
      );

      // Set another card as default if available
      const otherCard = await pool.query(
        'SELECT stripe_payment_method_id FROM saved_payment_methods WHERE user_id = $1 ORDER BY created_at LIMIT 1',
        [req.user.id]
      );

      if (otherCard.rows.length > 0) {
        await pool.query(
          'UPDATE saved_payment_methods SET is_default = true WHERE stripe_payment_method_id = $1',
          [otherCard.rows[0].stripe_payment_method_id]
        );
        await pool.query(
          'UPDATE users SET default_payment_method_id = $1 WHERE id = $2',
          [otherCard.rows[0].stripe_payment_method_id, req.user.id]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting payment method:', error);
    res.status(500).json({ error: 'Failed to delete payment method' });
  }
});

/**
 * Charge a saved payment method for auto-renewal
 * Called by the auto-renew background job
 * @param {Pool} pool - Database pool
 * @param {number} userId - User ID
 * @param {number} amount - Amount in dollars
 * @param {string} domainName - Domain being renewed
 * @param {string} paymentMethodId - Optional specific payment method (uses default if not provided)
 * @returns {Object} - { success, paymentIntentId, error }
 */
async function chargeForAutoRenewal(pool, userId, amount, domainName, paymentMethodId = null) {
  if (!stripeService.isConfigured()) {
    return { success: false, error: 'Stripe not configured' };
  }

  try {
    // Get user's Stripe customer ID and default payment method
    const userResult = await pool.query(
      'SELECT stripe_customer_id, default_payment_method_id, email FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user?.stripe_customer_id) {
      return { success: false, error: 'No Stripe customer found for user' };
    }

    const pmToCharge = paymentMethodId || user.default_payment_method_id;
    if (!pmToCharge) {
      return { success: false, error: 'No payment method available for auto-renewal' };
    }

    // Create payment intent for off-session charge
    const amountInCents = Math.round(amount * 100);
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: amountInCents,
      currency: 'usd',
      customer: user.stripe_customer_id,
      payment_method: pmToCharge,
      off_session: true,
      confirm: true,
      metadata: {
        userId: userId.toString(),
        type: 'auto_renewal',
        domainName: domainName
      }
    });

    if (paymentIntent.status === 'succeeded') {
      console.log(`Auto-renewal payment succeeded for ${domainName}: $${amount}`);
      return { success: true, paymentIntentId: paymentIntent.id };
    } else {
      return { success: false, error: `Payment status: ${paymentIntent.status}` };
    }
  } catch (error) {
    console.error(`Auto-renewal payment failed for ${domainName}:`, error.message);

    // Handle specific Stripe errors
    if (error.code === 'authentication_required') {
      return { success: false, error: 'Card requires authentication - please update payment method', requiresAction: true };
    } else if (error.code === 'card_declined') {
      return { success: false, error: 'Card was declined - please update payment method', cardDeclined: true };
    }

    return { success: false, error: error.message };
  }
}

// Manual trigger for testing (admin only)
router.post('/process-order/:orderId', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  // Check if admin
  const userResult = await pool.query(
    'SELECT is_admin, role_level FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userResult.rows[0]?.is_admin && userResult.rows[0]?.role_level < ROLE_LEVELS.ADMIN) {
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

// Export router and utility functions
router.chargeForAutoRenewal = chargeForAutoRenewal;
module.exports = router;
