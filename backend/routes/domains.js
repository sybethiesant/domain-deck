const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

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

    // TODO: Call eNom API to check availability
    // For now, return mock data
    const pricing = tldResult.rows[0];
    const available = Math.random() > 0.3; // Mock: 70% available

    res.json({
      domain: `${sld}.${tld}`,
      sld,
      tld,
      available,
      premium: false,
      pricing: {
        register: parseFloat(pricing.price_register),
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

      const pricing = tldResult.rows[0];

      // TODO: Call eNom API
      results.push({
        domain: `${sld}.${tld}`,
        sld,
        tld,
        available: Math.random() > 0.3,
        premium: false,
        pricing: {
          register: parseFloat(pricing.price_register),
          renew: parseFloat(pricing.price_renew)
        }
      });
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

    const suggestions = tldResult.rows.map(row => ({
      domain: `${cleanTerm}.${row.tld}`,
      tld: row.tld,
      price: parseFloat(row.price_register),
      available: Math.random() > 0.3 // TODO: Actual check
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

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching domain:', error);
    res.status(500).json({ error: 'Failed to fetch domain' });
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

  try {
    // Verify ownership
    const domainResult = await pool.query(
      'SELECT * FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, req.user.id]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // TODO: Call eNom API to update nameservers

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
    const result = await pool.query(
      `UPDATE domains SET auto_renew = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, domain_name, auto_renew`,
      [!!auto_renew, domainId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating auto-renew:', error);
    res.status(500).json({ error: 'Failed to update auto-renew setting' });
  }
});

// Toggle privacy
router.put('/:id/privacy', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const domainId = parseInt(req.params.id);
  const { privacy_enabled } = req.body;

  try {
    // TODO: Call eNom API

    const result = await pool.query(
      `UPDATE domains SET privacy_enabled = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, domain_name, privacy_enabled`,
      [!!privacy_enabled, domainId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating privacy:', error);
    res.status(500).json({ error: 'Failed to update privacy setting' });
  }
});

module.exports = router;
