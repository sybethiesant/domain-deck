const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const enom = require('../services/enom');
// Nameserver validation - security fix
function isValidNameserver(ns) {
  if (!ns || typeof ns !== 'string') return false;
  // Must be valid hostname format (RFC 1123)
  const nsRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return nsRegex.test(ns) && ns.length <= 253 && ns.includes('.');
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
              auto_renew, privacy_enabled, lock_status, nameservers
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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

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
    const nameservers = domain.nameservers ?
      (typeof domain.nameservers === 'string' ? JSON.parse(domain.nameservers) : domain.nameservers)
      : [];

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
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Call eNom API to update nameservers
    await enom.updateNameservers(sld, tld, nameservers);

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

// Toggle auto-renew
router.put('/:id/autorenew', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { auto_renew } = req.body;

  try {
    // Verify ownership and get domain
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Call eNom API to update auto-renew
    await enom.setAutoRenew(sld, tld, !!auto_renew);

    // Update local database
    const result = await pool.query(
      `UPDATE domains SET auto_renew = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, domain_name, auto_renew`,
      [!!auto_renew, domainId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating auto-renew:', error);
    res.status(500).json({ error: 'Failed to update auto-renew setting' });
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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Get privacy status from eNom
    const privacyStatus = await enom.getPrivacyStatus(sld, tld);

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
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // If trying to enable privacy, check if it's already purchased
    if (privacy_enabled) {
      const privacyStatus = await enom.getPrivacyStatus(sld, tld);

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

    // Call eNom API to toggle privacy
    await enom.setWhoisPrivacy(sld, tld, !!privacy_enabled);

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
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Call eNom API to set lock status
    await enom.setDomainLock(sld, tld, !!locked);

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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Get auth code from eNom (this also unlocks the domain)
    const result = await enom.getAuthCode(sld, tld);

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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Get contacts from eNom
    const contacts = await enom.getWhoisContacts(sld, tld);

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
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = domainResult.rows[0];
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Get current contacts first (for partial update support)
    const currentContacts = await enom.getWhoisContacts(sld, tld);

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

    // Update contacts via eNom
    await enom.updateContacts(sld, tld, updatedContacts);

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
  const { years = 1 } = req.body;

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
    const parts = domain.domain_name.split('.');
    const tld = parts.pop();
    const sld = parts.join('.');

    // Get renewal pricing
    const pricingResult = await pool.query(
      'SELECT price_renew FROM tld_pricing WHERE tld = $1',
      [tld]
    );

    if (pricingResult.rows.length === 0) {
      return res.status(400).json({ error: 'TLD pricing not found' });
    }

    const renewalPrice = parseFloat(pricingResult.rows[0].price_renew) * years;

    // Renew via eNom
    const result = await enom.renewDomain(sld, tld, years);

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
router.get('/admin/balance', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Check if user is admin
    const userResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const balance = await enom.getBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

module.exports = router;
