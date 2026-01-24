const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const enom = require('../services/enom');
const stripeService = require('../services/stripe');
// Nameserver validation - security fix
function isValidNameserver(ns) {
  if (!ns || typeof ns !== 'string') return false;
  // Must be valid hostname format (RFC 1123)
  const nsRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return nsRegex.test(ns) && ns.length <= 253 && ns.includes('.');
}

// Helper to check domain ownership, suspension status, and eNom mode
async function checkDomainAccess(pool, domainId, userId, options = {}) {
  const { allowSuspended = false } = options;

  const result = await pool.query('SELECT * FROM domains WHERE id = $1', [domainId]);
  if (result.rows.length === 0) {
    return { error: 'Domain not found', status: 404 };
  }
  const domain = result.rows[0];
  if (domain.user_id !== userId) {
    return { error: 'Domain not found', status: 404 };
  }
  if (!allowSuspended && domain.status === 'suspended') {
    return { error: 'This domain is suspended. Please contact support for assistance.', status: 403 };
  }

  // Return the domain's eNom mode so it can be passed to API calls
  // Operations will use the domain's mode, not the global mode
  domain.enomMode = domain.enom_mode || 'test';

  return { domain };
}



// Get TLD pricing list
router.get('/pricing', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT tld, price_register, price_renew, price_transfer, price_privacy,
              min_years, max_years, promo_price, promo_expires_at
       FROM tld_pricing
       WHERE is_active = true
       ORDER BY tld`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

// Get extended attributes/requirements for a TLD
// Some TLDs (especially ccTLDs) require additional information
router.get('/tld-requirements/:tld', async (req, res) => {
  const { tld } = req.params;

  try {
    const requirements = await enom.getExtendedAttributes(tld);
    res.json(requirements);
  } catch (error) {
    console.error('Error fetching TLD requirements:', error);
    res.status(500).json({ error: 'Failed to fetch TLD requirements' });
  }
});

// Get requirements for multiple TLDs at once (for cart)
router.post('/tld-requirements', async (req, res) => {
  const { tlds } = req.body;

  if (!Array.isArray(tlds) || tlds.length === 0) {
    return res.status(400).json({ error: 'tlds array required' });
  }

  try {
    const results = {};
    for (const tld of [...new Set(tlds)]) { // Dedupe
      try {
        results[tld] = await enom.getExtendedAttributes(tld);
      } catch (e) {
        results[tld] = { tld, hasRequirements: false, attributes: [], error: e.message };
      }
    }
    res.json(results);
  } catch (error) {
    console.error('Error fetching TLD requirements:', error);
    res.status(500).json({ error: 'Failed to fetch TLD requirements' });
  }
});

// Check domain availability
router.get('/check/:domain', async (req, res) => {
  const { domain } = req.params;
  const pool = req.app.locals.pool;

  // Parse domain
  const parts = domain.toLowerCase().split('.');
  if (parts.length < 2) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }

  const tld = parts.pop();
  const sld = parts.join('.');

  // Validate SLD
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sld) || sld.length < 1 || sld.length > 63) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  try {
    // Check if TLD is supported
    const tldResult = await pool.query(
      'SELECT * FROM tld_pricing WHERE tld = $1 AND is_active = true',
      [tld]
    );

    if (tldResult.rows.length === 0) {
      return res.status(400).json({ error: 'TLD not supported', tld });
    }

    const pricing = tldResult.rows[0];

    // Call eNom API to check availability
    const availability = await enom.checkDomain(sld, tld);

    res.json({
      domain: `${sld}.${tld}`,
      sld,
      tld,
      available: availability.available,
      premium: availability.premium,
      premiumPrice: availability.premiumPrice,
      pricing: {
        register: availability.premium && availability.premiumPrice
          ? availability.premiumPrice
          : parseFloat(pricing.price_register),
        renew: parseFloat(pricing.price_renew),
        transfer: parseFloat(pricing.price_transfer),
        privacy: parseFloat(pricing.price_privacy)
      }
    });
  } catch (error) {
    console.error('Error checking domain:', error);
    res.status(500).json({ error: 'Failed to check domain availability' });
  }
});

// Bulk check domains
router.post('/check-bulk', async (req, res) => {
  const { domains } = req.body;
  const pool = req.app.locals.pool;

  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: 'Domains array required' });
  }

  if (domains.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 domains per request' });
  }

  try {
    const results = [];
    const domainChecks = [];

    // Parse and validate domains first
    for (const domain of domains) {
      const parts = domain.toLowerCase().split('.');
      if (parts.length < 2) continue;

      const tld = parts.pop();
      const sld = parts.join('.');

      const tldResult = await pool.query(
        'SELECT * FROM tld_pricing WHERE tld = $1 AND is_active = true',
        [tld]
      );

      if (tldResult.rows.length === 0) {
        results.push({
          domain: `${sld}.${tld}`,
          available: false,
          error: 'TLD not supported'
        });
        continue;
      }

      domainChecks.push({
        sld,
        tld,
        pricing: tldResult.rows[0]
      });
    }

    // Check availability with eNom
    if (domainChecks.length > 0) {
      const enomResults = await enom.checkDomainBulk(
        domainChecks.map(d => ({ sld: d.sld, tld: d.tld }))
      );

      for (let i = 0; i < enomResults.length; i++) {
        const enomResult = enomResults[i];
        const domainCheck = domainChecks[i];

        results.push({
          domain: enomResult.domain,
          sld: enomResult.sld,
          tld: enomResult.tld,
          available: enomResult.available,
          premium: enomResult.premium,
          error: enomResult.error,
          pricing: {
            register: enomResult.premium && enomResult.premiumPrice
              ? enomResult.premiumPrice
              : parseFloat(domainCheck.pricing.price_register),
            renew: parseFloat(domainCheck.pricing.price_renew)
          }
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error checking domains:', error);
    res.status(500).json({ error: 'Failed to check domains' });
  }
});

// Get domain suggestions
router.get('/suggestions/:term', async (req, res) => {
  const { term } = req.params;
  const pool = req.app.locals.pool;

  // Sanitize term
  const cleanTerm = term.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (cleanTerm.length < 2) {
    return res.status(400).json({ error: 'Search term too short' });
  }

  try {
    // Get active TLDs
    const tldResult = await pool.query(
      'SELECT tld, price_register FROM tld_pricing WHERE is_active = true ORDER BY price_register LIMIT 10'
    );

    // Build domain list to check
    const domainsToCheck = tldResult.rows.map(row => ({
      sld: cleanTerm,
      tld: row.tld
    }));

    // Check availability with eNom
    const enomResults = await enom.checkDomainBulk(domainsToCheck);

    const suggestions = enomResults.map((result, index) => ({
      domain: result.domain,
      tld: result.tld,
      price: result.premium && result.premiumPrice
        ? result.premiumPrice
        : parseFloat(tldResult.rows[index].price_register),
      available: result.available,
      premium: result.premium
    }));

    res.json(suggestions);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// Get user's domains
router.get('/', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT id, domain_name, tld, status, registration_date, expiration_date,
              auto_renew, privacy_enabled, lock_status, nameservers, enom_mode
       FROM domains
       WHERE user_id = $1
       ORDER BY expiration_date ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// ============================================
// DOMAIN BY ID ROUTES
// NOTE: /push-requests route is defined later in this file (before module.exports)
// to ensure it's not shadowed by /:id routes
// ============================================

// Get single domain details
router.get('/:id', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      `SELECT d.*,
              rc.first_name as registrant_first_name, rc.last_name as registrant_last_name,
              rc.email as registrant_email
       FROM domains d
       LEFT JOIN domain_contacts rc ON d.registrant_contact_id = rc.id
       WHERE d.id = $1 AND d.user_id = $2`,
      [domainId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Get live data from eNom
    const domain = result.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    try {
      const enomInfo = await enom.getDomainInfo(sld, tld);
      domain.enom_status = enomInfo.status;
      domain.enom_expiration = enomInfo.expirationDate;
    } catch (e) {
      // Continue with DB data if eNom fails
      console.error('Failed to get eNom info:', e.message);
    }

    res.json(domain);
  } catch (error) {
    console.error('Error fetching domain:', error);
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

// Get nameservers for a domain (reads from local DB - synced by background job)
router.get('/:id/nameservers', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership and get domain
    const domainResult = await pool.query(
      'SELECT nameservers FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    let nameservers = [];
    if (domain.nameservers) {
      if (typeof domain.nameservers === 'string') {
        try {
          nameservers = JSON.parse(domain.nameservers);
        } catch (e) {
          console.error('Failed to parse nameservers JSON:', e.message);
          nameservers = [];
        }
      } else {
        nameservers = domain.nameservers;
      }
    }

    res.json({ nameservers });
  } catch (error) {
    console.error('Error fetching nameservers:', error);
    res.status(500).json({ error: 'Failed to fetch nameservers' });
  }
});

// Update nameservers
router.put('/:id/nameservers', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { nameservers } = req.body;

  if (!Array.isArray(nameservers) || nameservers.length < 2 || nameservers.length > 13) {
    return res.status(400).json({ error: 'Must provide 2-13 nameservers' });
  }

  // Validate each nameserver format
  for (const ns of nameservers) {
    if (!isValidNameserver(ns)) {
      return res.status(400).json({ error: `Invalid nameserver format: ${ns}` });
    }
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Call eNom API to update nameservers (use domain's mode)
    await enom.updateNameservers(sld, tld, nameservers, { mode: domain.enomMode });

    // Update local database
    await pool.query(
      'UPDATE domains SET nameservers = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(nameservers), domainId]
    );

    res.json({ message: 'Nameservers updated successfully', nameservers });
  } catch (error) {
    console.error('Error updating nameservers:', error);
    res.status(500).json({ error: 'Failed to update nameservers' });
  }
});

// Toggle auto-renew (simple toggle - use setup-auto-renew for payment method setup)
router.put('/:id/autorenew', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { auto_renew } = req.body;

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // If turning OFF auto-renew, just update the database (no payment method needed)
    if (!auto_renew) {
      // Call eNom API to update auto-renew (use domain's mode)
      await enom.setAutoRenew(sld, tld, false, { mode: domain.enomMode });

      const result = await pool.query(
        `UPDATE domains SET auto_renew = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, domain_name, auto_renew, auto_renew_payment_method_id`,
        [domainId]
      );

      return res.json(result.rows[0]);
    }

    // If turning ON auto-renew, check if payment method exists
    if (!domain.auto_renew_payment_method_id) {
      // Return a signal that payment setup is required
      return res.status(402).json({
        error: 'Payment method required',
        code: 'PAYMENT_METHOD_REQUIRED',
        message: 'A payment method must be set up for auto-renewal. Use /setup-auto-renew to add one.',
        domainId: domain.id,
        domainName: `${domain.domain_name}.${domain.tld}`
      });
    }

    // Payment method exists, enable auto-renew (use domain's mode)
    await enom.setAutoRenew(sld, tld, true, { mode: domain.enomMode });

    const result = await pool.query(
      `UPDATE domains SET auto_renew = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, domain_name, auto_renew, auto_renew_payment_method_id`,
      [domainId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating auto-renew:', error);
    res.status(500).json({ error: 'Failed to update auto-renew setting' });
  }
});

// Create Setup Intent for auto-renew payment method (no charge)
router.post('/:id/setup-auto-renew', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;

    // Get or create Stripe customer for this user
    const userResult = await pool.query(
      'SELECT stripe_customer_id, email, full_name FROM users WHERE id = $1',
      [req.user.id]
    );

    let customerId = userResult.rows[0].stripe_customer_id;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripeService.createCustomer({
        email: userResult.rows[0].email,
        name: userResult.rows[0].full_name,
        metadata: {
          userId: req.user.id.toString()
        }
      });
      customerId = customer.id;

      // Save customer ID
      await pool.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, req.user.id]
      );
    }

    // Create Setup Intent (validates payment method without charging)
    // Only allow payment methods that support off-session charges (auto-renewal)
    const setupIntent = await stripeService.createSetupIntent({
      customer: customerId,
      payment_method_types: ['card', 'link', 'cashapp', 'amazon_pay'],
      usage: 'off_session', // Explicitly indicate this will be used for future off-session payments
      metadata: {
        userId: req.user.id.toString(),
        domainId: domainId.toString(),
        domainName: `${domain.domain_name}.${domain.tld}`,
        purpose: 'auto_renew'
      }
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      domainId: domain.id,
      domainName: `${domain.domain_name}.${domain.tld}`
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    res.status(500).json({ error: 'Failed to initialize payment setup' });
  }
});

// Confirm auto-renew setup after successful Setup Intent
router.post('/:id/confirm-auto-renew', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { setup_intent_id, payment_method_id } = req.body;

  if (!setup_intent_id && !payment_method_id) {
    return res.status(400).json({ error: 'setup_intent_id or payment_method_id required' });
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    let paymentMethodId = payment_method_id;

    // If setup_intent_id provided, retrieve the payment method from it
    if (setup_intent_id) {
      const setupIntent = await stripeService.retrieveSetupIntent(setup_intent_id);

      if (setupIntent.status !== 'succeeded') {
        return res.status(400).json({
          error: 'Setup Intent not completed',
          status: setupIntent.status
        });
      }

      // Verify the setup intent belongs to this domain
      if (setupIntent.metadata.domainId !== domainId.toString()) {
        return res.status(400).json({ error: 'Setup Intent does not match this domain' });
      }

      paymentMethodId = setupIntent.payment_method;
    }

    if (!paymentMethodId) {
      return res.status(400).json({ error: 'No payment method found' });
    }

    // Get payment method details for display
    const paymentMethod = await stripeService.retrievePaymentMethod(paymentMethodId);

    // Update eNom auto-renew setting (use domain's mode)
    await enom.setAutoRenew(sld, tld, true, { mode: domain.enomMode });

    // Save payment method to domain and enable auto-renew
    const result = await pool.query(
      `UPDATE domains SET
        auto_renew = true,
        auto_renew_payment_method_id = $1,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, domain_name, tld, auto_renew, auto_renew_payment_method_id`,
      [paymentMethodId, domainId]
    );

    // Log activity
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        'auto_renew_setup',
        'domain',
        domainId,
        JSON.stringify({
          domain: `${domain.domain_name}.${domain.tld}`,
          paymentMethodLast4: paymentMethod.card?.last4,
          paymentMethodBrand: paymentMethod.card?.brand
        })
      ]
    );

    res.json({
      success: true,
      domain: result.rows[0],
      paymentMethod: {
        id: paymentMethodId,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year
      },
      message: `Auto-renewal enabled for ${domain.domain_name}.${domain.tld}. Your card will be charged when the domain is due for renewal.`
    });
  } catch (error) {
    console.error('Error confirming auto-renew setup:', error);
    res.status(500).json({ error: 'Failed to confirm auto-renew setup' });
  }
});

// Get auto-renew payment method details
router.get('/:id/auto-renew-status', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT id, domain_name, tld, auto_renew, auto_renew_payment_method_id, expiration_date FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    let paymentMethod = null;

    // Get payment method details if one is saved
    if (domain.auto_renew_payment_method_id) {
      try {
        const pm = await stripeService.retrievePaymentMethod(domain.auto_renew_payment_method_id);
        paymentMethod = {
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year
        };
      } catch (e) {
        // Payment method may have been deleted
        console.error('Error retrieving payment method:', e.message);
      }
    }

    // Get renewal pricing
    const pricingResult = await pool.query(
      'SELECT price_renew FROM tld_pricing WHERE tld = $1',
      [domain.tld]
    );

    res.json({
      domainId: domain.id,
      domainName: `${domain.domain_name}.${domain.tld}`,
      autoRenew: domain.auto_renew,
      expirationDate: domain.expiration_date,
      paymentMethod,
      renewalPrice: pricingResult.rows[0]?.price_renew || null
    });
  } catch (error) {
    console.error('Error getting auto-renew status:', error);
    res.status(500).json({ error: 'Failed to get auto-renew status' });
  }
});

// Remove auto-renew payment method (disable auto-renew)
router.delete('/:id/auto-renew', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Update eNom auto-renew setting (use domain's mode)
    await enom.setAutoRenew(sld, tld, false, { mode: domain.enomMode });

    // Disable auto-renew and clear payment method
    const result = await pool.query(
      `UPDATE domains SET
        auto_renew = false,
        auto_renew_payment_method_id = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, domain_name, tld, auto_renew`,
      [domainId]
    );

    res.json({
      success: true,
      domain: result.rows[0],
      message: 'Auto-renewal disabled'
    });
  } catch (error) {
    console.error('Error disabling auto-renew:', error);
    res.status(500).json({ error: 'Failed to disable auto-renew' });
  }
});

// Get privacy status for a domain
router.get('/:id/privacy', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get privacy status from eNom (use domain's mode)
    const privacyStatus = await enom.getPrivacyStatus(sld, tld, { mode: domain.enom_mode || 'test' });

    res.json({
      domainId,
      domainName: domain.domain_name,
      ...privacyStatus
    });
  } catch (error) {
    console.error('Error getting privacy status:', error);
    res.status(500).json({ error: 'Failed to get privacy status' });
  }
});

// Toggle privacy
router.put('/:id/privacy', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const privacy_enabled = req.body.privacy_enabled ?? req.body.privacy;
  const force = req.body.force === true; // Allow forcing even if it will charge

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // If trying to enable privacy, check if it's already purchased
    if (privacy_enabled) {
      const privacyStatus = await enom.getPrivacyStatus(sld, tld, { mode: domain.enomMode });

      // If privacy will incur a charge and force is not set, return warning
      if (privacyStatus.willCharge && !force) {
        return res.status(402).json({
          error: 'Privacy service requires payment',
          code: 'PAYMENT_REQUIRED',
          message: 'Enabling WHOIS privacy will incur a charge. Set force=true to proceed or purchase through checkout.',
          privacyStatus
        });
      }
    }

    // Call eNom API to toggle privacy (use domain's mode)
    await enom.setWhoisPrivacy(sld, tld, !!privacy_enabled, { mode: domain.enomMode });

    // Update local database
    const result = await pool.query(
      `UPDATE domains SET privacy_enabled = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, domain_name, privacy_enabled`,
      [!!privacy_enabled, domainId, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating privacy:', error);
    res.status(500).json({ error: 'Failed to update privacy setting' });
  }
});

// Toggle domain lock
router.put('/:id/lock', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { locked } = req.body;

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Call eNom API to set lock status (use domain's mode)
    await enom.setDomainLock(sld, tld, !!locked, { mode: domain.enomMode });

    // Update local database
    const result = await pool.query(
      `UPDATE domains SET lock_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, domain_name, lock_status`,
      [!!locked, domainId, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating lock status:', error);
    res.status(500).json({ error: 'Failed to update lock status' });
  }
});

// Get auth code (EPP code) for transfer out
router.get('/:id/authcode', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get auth code from eNom (this also unlocks the domain) - use domain's mode
    const result = await enom.getAuthCode(sld, tld, { mode: domain.enom_mode || 'test' });

    // Update lock status in database since getAuthCode unlocks the domain
    await pool.query(
      'UPDATE domains SET lock_status = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [domainId]
    );

    res.json({
      domain: domain.domain_name,
      authCode: result.authCode,
      message: 'Domain has been unlocked to allow transfer'
    });
  } catch (error) {
    console.error('Error getting auth code:', error);
    res.status(500).json({ error: 'Failed to get auth code' });
  }
});

// Get WHOIS contacts for domain
router.get('/:id/contacts', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get contacts from eNom (use domain's mode)
    const contacts = await enom.getWhoisContacts(sld, tld, { mode: domain.enom_mode || 'test' });

    res.json({
      domain: domain.domain_name,
      ...contacts
    });
  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// Update domain contacts (supports partial updates)
router.put('/:id/contacts', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { registrant, admin, tech, billing } = req.body;

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get current contacts first (for partial update support) - use domain's mode
    const currentContacts = await enom.getWhoisContacts(sld, tld, { mode: domain.enomMode });

    // Helper to normalize contact format for eNom API
    const normalizeContact = (contact) => {
      if (!contact) return null;
      return {
        firstName: contact.firstName || contact.first_name,
        lastName: contact.lastName || contact.last_name,
        organization: contact.organization || contact.company || '',
        email: contact.email || contact.emailAddress,
        phone: contact.phone,
        address1: contact.address1 || contact.address_line1 || contact.Address1,
        address2: contact.address2 || contact.address_line2 || contact.Address2 || '',
        city: contact.city || contact.City,
        state: contact.state || contact.stateProvince || contact.StateProvince,
        postalCode: contact.postalCode || contact.postal_code || contact.PostalCode,
        country: contact.country || contact.Country || 'US'
      };
    };

    // Merge provided contacts with current contacts (partial update support)
    const updatedContacts = {
      registrant: registrant ? normalizeContact(registrant) : normalizeContact(currentContacts.registrant),
      admin: admin ? normalizeContact(admin) : normalizeContact(currentContacts.admin),
      tech: tech ? normalizeContact(tech) : normalizeContact(currentContacts.tech),
      billing: billing ? normalizeContact(billing) : normalizeContact(currentContacts.billing)
    };

    // Update contacts via eNom (use domain's mode)
    await enom.updateContacts(sld, tld, updatedContacts, { mode: domain.enomMode });

    res.json({
      success: true,
      domain: domain.domain_name,
      message: 'Contacts updated successfully'
    });
  } catch (error) {
    console.error('Error updating contacts:', error);
    res.status(500).json({ error: 'Failed to update contacts' });
  }
});

// Renew domain
router.post('/:id/renew', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const yearsParam = parseInt(req.body.years) || 1;

  // Validate years parameter
  if (yearsParam < 1 || yearsParam > 10 || isNaN(yearsParam)) {
    return res.status(400).json({ error: 'Years must be between 1 and 10' });
  }
  const years = yearsParam;

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get renewal pricing
    const pricingResult = await pool.query(
      'SELECT price_renew FROM tld_pricing WHERE tld = $1',
      [tld]
    );

    if (pricingResult.rows.length === 0) {
      return res.status(400).json({ error: 'TLD pricing not found' });
    }

    const renewalPrice = parseFloat(pricingResult.rows[0].price_renew) * years;

    // Renew via eNom (use domain's mode)
    const result = await enom.renewDomain(sld, tld, years, { mode: domain.enomMode });

    // Parse new expiration date
    let newExpDate = null;
    if (result.newExpiration) {
      const expMatch = result.newExpiration.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (expMatch) {
        newExpDate = `${expMatch[3]}-${expMatch[1].padStart(2, '0')}-${expMatch[2].padStart(2, '0')}`;
      }
    }

    // Update domain in database
    await pool.query(
      `UPDATE domains SET
        expiration_date = COALESCE($1, expiration_date + ($2 || ' years')::interval),
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newExpDate, years, domainId]
    );

    // Create order record for the renewal
    const orderResult = await pool.query(
      `INSERT INTO orders (user_id, order_number, status, payment_status, subtotal, total, processed_at)
       VALUES ($1, $2, 'completed', 'paid', $3, $3, CURRENT_TIMESTAMP)
       RETURNING id, order_number`,
      [req.user.id, `ORD-${Date.now()}`, renewalPrice]
    );

    await pool.query(
      `INSERT INTO order_items (order_id, domain_name, tld, item_type, years, price, status)
       VALUES ($1, $2, $3, 'renew', $4, $5, 'completed')`,
      [orderResult.rows[0].id, sld, tld, years, renewalPrice]
    );

    res.json({
      success: true,
      domain: domain.domain_name,
      years,
      newExpiration: newExpDate || result.newExpiration,
      orderId: result.orderId,
      orderNumber: orderResult.rows[0].order_number,
      cost: renewalPrice
    });
  } catch (error) {
    console.error('Error renewing domain:', error);
    res.status(500).json({ error: 'Failed to renew domain' });
  }
});

// Get eNom account balance (admin only)
router.get('/admin/balance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const balance = await enom.getBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// ============================================
// DNS HOST RECORD ROUTES
// ============================================

// Get all DNS host records for a domain
router.get('/:id/dns', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get host records from eNom
    const records = await enom.getHostRecords(sld, tld, { mode: domain.enom_mode || 'test' });

    res.json(records);
  } catch (error) {
    console.error('Error getting DNS records:', error);
    res.status(500).json({ error: 'Failed to get DNS records' });
  }
});

// Set all DNS host records for a domain (replaces existing)
router.put('/:id/dns', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { records } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records array is required' });
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Set host records via eNom
    const result = await enom.setHostRecords(sld, tld, records, { mode: domain.enomMode });

    res.json(result);
  } catch (error) {
    console.error('Error setting DNS records:', error);
    res.status(500).json({ error: error.message || 'Failed to set DNS records' });
  }
});

// Add a single DNS record
router.post('/:id/dns', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { hostName, recordType, address, mxPref } = req.body;

  if (!recordType || !address) {
    return res.status(400).json({ error: 'recordType and address are required' });
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Add host record via eNom
    const result = await enom.addHostRecord(sld, tld, {
      hostName: hostName || '@',
      recordType,
      address,
      mxPref
    }, { mode: domain.enomMode });

    res.json(result);
  } catch (error) {
    console.error('Error adding DNS record:', error);
    res.status(500).json({ error: error.message || 'Failed to add DNS record' });
  }
});

// Delete a DNS record by index
router.delete('/:id/dns/:recordIndex', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const recordIndex = parseInt(req.params.recordIndex);

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Delete host record via eNom
    const result = await enom.deleteHostRecord(sld, tld, recordIndex, { mode: domain.enomMode });

    res.json(result);
  } catch (error) {
    console.error('Error deleting DNS record:', error);
    res.status(500).json({ error: error.message || 'Failed to delete DNS record' });
  }
});

// ============================================
// EMAIL FORWARDING ROUTES (DEPRECATED)
// ============================================

// Get email forwarding for a domain
router.get('/:id/email-forwarding', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get email forwards from eNom
    const forwards = await enom.getEmailForwarding(sld, tld, { mode: domain.enom_mode || 'test' });

    res.json(forwards);
  } catch (error) {
    console.error('Error getting email forwarding:', error);
    res.status(500).json({ error: 'Failed to get email forwarding' });
  }
});

// Add email forwarding
router.post('/:id/email-forwarding', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { emailUser, forwardTo } = req.body;

  if (!emailUser || !forwardTo) {
    return res.status(400).json({ error: 'emailUser and forwardTo are required' });
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Set email forward via eNom
    const result = await enom.setEmailForward(sld, tld, emailUser, forwardTo, { mode: domain.enomMode });

    res.json(result);
  } catch (error) {
    console.error('Error setting email forwarding:', error);
    res.status(500).json({ error: error.message || 'Failed to set email forwarding' });
  }
});

// Delete email forwarding
router.delete('/:id/email-forwarding/:emailUser', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { emailUser } = req.params;

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Delete email forward via eNom
    const result = await enom.deleteEmailForward(sld, tld, emailUser, { mode: domain.enomMode });

    res.json(result);
  } catch (error) {
    console.error('Error deleting email forwarding:', error);
    res.status(500).json({ error: error.message || 'Failed to delete email forwarding' });
  }
});

// ============================================
// URL FORWARDING ROUTES
// ============================================

// Get URL forwarding for a domain
router.get('/:id/url-forwarding', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Get URL forwarding from eNom
    const forwarding = await enom.getUrlForwarding(sld, tld, { mode: domain.enom_mode || 'test' });

    res.json(forwarding);
  } catch (error) {
    console.error('Error getting URL forwarding:', error);
    res.status(500).json({ error: 'Failed to get URL forwarding' });
  }
});

// Set URL forwarding
router.put('/:id/url-forwarding', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { forwardUrl, forwardType, cloak, cloakTitle, cloakDescription, cloakKeywords } = req.body;

  if (!forwardUrl) {
    return res.status(400).json({ error: 'forwardUrl is required' });
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Set URL forwarding via eNom
    console.log(`[URL Forward] Setting forwarding for ${sld}.${tld}: type=${forwardType}, url=${forwardUrl}, cloak=${cloak}`);
    const result = await enom.setUrlForwarding(sld, tld, {
      forwardUrl,
      forwardType: forwardType || 'temporary',
      cloak: cloak || false,
      cloakTitle,
      cloakDescription,
      cloakKeywords
    }, { mode: domain.enomMode });

    console.log(`[URL Forward] Success for ${sld}.${tld}:`, result);
    res.json(result);
  } catch (error) {
    console.error(`[URL Forward] Error for ${sld}.${tld}:`, error.message);
    res.status(500).json({ error: error.message || 'Failed to set URL forwarding' });
  }
});

// Disable URL forwarding
router.delete('/:id/url-forwarding', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, req.user.id);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;
    const sld = domain.domain_name;
    const tld = domain.tld;

    // Disable URL forwarding via eNom
    const result = await enom.disableUrlForwarding(sld, tld, { mode: domain.enomMode });

    res.json(result);
  } catch (error) {
    console.error('Error disabling URL forwarding:', error);
    res.status(500).json({ error: error.message || 'Failed to disable URL forwarding' });
  }
});

// Test route removed - was for debugging only

// ============================================
// DOMAIN PUSH (Internal Transfer) ROUTES
// ============================================

// Get pending push requests for current user (incoming and outgoing)
router.get('/push-requests', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;

  try {
    // Get incoming requests (domains being pushed TO this user)
    // Filter out expired requests (expires_at is null or in the future)
    const incoming = await pool.query(`
      SELECT
        dpr.*,
        d.domain_name, d.tld,
        u.email as from_email, u.full_name as from_name
      FROM domain_push_requests dpr
      JOIN domains d ON d.id = dpr.domain_id
      JOIN users u ON u.id = dpr.from_user_id
      WHERE dpr.to_user_id = $1 AND dpr.status = 'pending'
        AND (dpr.expires_at IS NULL OR dpr.expires_at > CURRENT_TIMESTAMP)
      ORDER BY dpr.created_at DESC
    `, [userId]);

    // Get outgoing requests (domains this user is pushing)
    // Filter out expired requests
    const outgoing = await pool.query(`
      SELECT
        dpr.*,
        d.domain_name, d.tld,
        u.email as to_email, u.full_name as to_name
      FROM domain_push_requests dpr
      JOIN domains d ON d.id = dpr.domain_id
      JOIN users u ON u.id = dpr.to_user_id
      WHERE dpr.from_user_id = $1 AND dpr.status = 'pending'
        AND (dpr.expires_at IS NULL OR dpr.expires_at > CURRENT_TIMESTAMP)
      ORDER BY dpr.created_at DESC
    `, [userId]);

    res.json({
      incoming: incoming.rows,
      outgoing: outgoing.rows
    });
  } catch (error) {
    console.error('Error fetching push requests:', error);
    res.status(500).json({ error: 'Failed to fetch push requests' });
  }
});

// Get push history for a domain
router.get('/:id/push-history', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, userId]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const history = await pool.query(`
      SELECT
        dpr.*,
        fu.email as from_email, fu.full_name as from_name,
        tu.email as to_email, tu.full_name as to_name
      FROM domain_push_requests dpr
      JOIN users fu ON fu.id = dpr.from_user_id
      JOIN users tu ON tu.id = dpr.to_user_id
      WHERE dpr.domain_id = $1
      ORDER BY dpr.created_at DESC
      LIMIT 20
    `, [domainId]);

    res.json(history.rows);
  } catch (error) {
    console.error('Error fetching push history:', error);
    res.status(500).json({ error: 'Failed to fetch push history' });
  }
});

// Initiate a domain push to another user
router.post('/:id/push', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const userId = req.user.id;
  const { to_email, notes } = req.body;

  if (!to_email) {
    return res.status(400).json({ error: 'Recipient email is required' });
  }

  try {
    // Verify ownership and check if suspended
    const access = await checkDomainAccess(pool, domainId, userId);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const domain = access.domain;

    // Check for existing pending push request
    const existingPush = await pool.query(
      "SELECT * FROM domain_push_requests WHERE domain_id = $1 AND status = 'pending'",
      [domainId]
    );
    if (existingPush.rows.length > 0) {
      return res.status(400).json({ error: 'This domain already has a pending push request' });
    }

    // Find recipient user
    const recipientResult = await pool.query(
      'SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER($1)',
      [to_email.trim()]
    );

    if (recipientResult.rows.length === 0) {
      return res.status(404).json({ error: 'No user found with that email address' });
    }

    const recipient = recipientResult.rows[0];

    if (recipient.id === userId) {
      return res.status(400).json({ error: 'You cannot push a domain to yourself' });
    }

    // Get push timeout setting
    const timeoutResult = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'push_timeout_days'"
    );
    const timeoutDays = parseInt(timeoutResult.rows[0]?.value) || 7;

    // Create push request with expiration
    const pushResult = await pool.query(`
      INSERT INTO domain_push_requests
        (domain_id, from_user_id, to_user_id, to_email, notes, initiated_by_admin, expires_at)
      VALUES ($1, $2, $3, $4, $5, false, CURRENT_TIMESTAMP + ($6 || ' days')::interval)
      RETURNING *
    `, [domainId, userId, recipient.id, recipient.email, notes || null, timeoutDays]);

    res.json({
      success: true,
      message: `Domain push request sent to ${recipient.email}`,
      pushRequest: pushResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating push request:', error);
    res.status(500).json({ error: 'Failed to create push request' });
  }
});

// Accept an incoming push request
router.post('/push-requests/:requestId/accept', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = parseInt(req.params.requestId);
  const userId = req.user.id;

  try {
    // Get the push request
    const pushResult = await pool.query(
      'SELECT * FROM domain_push_requests WHERE id = $1',
      [requestId]
    );

    if (pushResult.rows.length === 0) {
      return res.status(404).json({ error: 'Push request not found' });
    }

    const pushRequest = pushResult.rows[0];

    // Verify this user is the recipient
    if (pushRequest.to_user_id !== userId) {
      return res.status(403).json({ error: 'You are not authorized to accept this request' });
    }

    if (pushRequest.status !== 'pending') {
      return res.status(400).json({ error: `This request is already ${pushRequest.status}` });
    }

    // Check if request has expired
    if (pushRequest.expires_at && new Date(pushRequest.expires_at) < new Date()) {
      // Mark as expired
      await pool.query(
        "UPDATE domain_push_requests SET status = 'expired', responded_at = CURRENT_TIMESTAMP WHERE id = $1",
        [requestId]
      );
      return res.status(400).json({ error: 'This push request has expired' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update push request status
      await client.query(`
        UPDATE domain_push_requests
        SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [requestId]);

      // Transfer domain ownership
      await client.query(`
        UPDATE domains
        SET user_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [userId, pushRequest.domain_id]);

      await client.query('COMMIT');

      // Get domain details for response
      const domainResult = await pool.query(
        'SELECT domain_name, tld FROM domains WHERE id = $1',
        [pushRequest.domain_id]
      );
      const domain = domainResult.rows[0];

      res.json({
        success: true,
        message: `Domain ${domain.domain_name}.${domain.tld} has been transferred to your account`
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error accepting push request:', error);
    res.status(500).json({ error: 'Failed to accept push request' });
  }
});

// Reject an incoming push request
router.post('/push-requests/:requestId/reject', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = parseInt(req.params.requestId);
  const userId = req.user.id;

  try {
    // Get the push request
    const pushResult = await pool.query(
      'SELECT * FROM domain_push_requests WHERE id = $1',
      [requestId]
    );

    if (pushResult.rows.length === 0) {
      return res.status(404).json({ error: 'Push request not found' });
    }

    const pushRequest = pushResult.rows[0];

    // Verify this user is the recipient
    if (pushRequest.to_user_id !== userId) {
      return res.status(403).json({ error: 'You are not authorized to reject this request' });
    }

    if (pushRequest.status !== 'pending') {
      return res.status(400).json({ error: `This request is already ${pushRequest.status}` });
    }

    // Update status
    await pool.query(`
      UPDATE domain_push_requests
      SET status = 'rejected', responded_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [requestId]);

    res.json({
      success: true,
      message: 'Push request rejected'
    });
  } catch (error) {
    console.error('Error rejecting push request:', error);
    res.status(500).json({ error: 'Failed to reject push request' });
  }
});

// Cancel an outgoing push request (sender cancels)
router.post('/push-requests/:requestId/cancel', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const requestId = parseInt(req.params.requestId);
  const userId = req.user.id;

  try {
    // Get the push request
    const pushResult = await pool.query(
      'SELECT * FROM domain_push_requests WHERE id = $1',
      [requestId]
    );

    if (pushResult.rows.length === 0) {
      return res.status(404).json({ error: 'Push request not found' });
    }

    const pushRequest = pushResult.rows[0];

    // Verify this user is the sender
    if (pushRequest.from_user_id !== userId) {
      return res.status(403).json({ error: 'You are not authorized to cancel this request' });
    }

    if (pushRequest.status !== 'pending') {
      return res.status(400).json({ error: `This request is already ${pushRequest.status}` });
    }

    // Update status
    await pool.query(`
      UPDATE domain_push_requests
      SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [requestId]);

    res.json({
      success: true,
      message: 'Push request cancelled'
    });
  } catch (error) {
    console.error('Error cancelling push request:', error);
    res.status(500).json({ error: 'Failed to cancel push request' });
  }
});

module.exports = router;
