const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Get all contacts for the authenticated user
router.get('/', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT * FROM domain_contacts WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get default contact (or null if none set)
// IMPORTANT: This route must be defined BEFORE /:id to avoid being caught by the parameterized route
router.get('/default/current', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT * FROM domain_contacts WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [req.user.id]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching default contact:', error);
    res.status(500).json({ error: 'Failed to fetch default contact' });
  }
});

// Get a single contact
router.get('/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM domain_contacts WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// Create a new contact
router.post('/', async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    contact_type = 'registrant',
    first_name,
    last_name,
    organization,
    email,
    phone,
    phone_ext,
    fax,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country = 'US',
    is_default = false
  } = req.body;

  // Validation
  if (!first_name || !last_name || !email || !phone || !address_line1 || !city || !state || !postal_code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Use transaction if setting as default to prevent race conditions
  const client = is_default ? await pool.connect() : null;

  try {
    if (client) {
      await client.query('BEGIN');
    }

    const queryRunner = client || pool;

    // If this is set as default, unset other defaults first
    if (is_default) {
      await queryRunner.query(
        `UPDATE domain_contacts SET is_default = false WHERE user_id = $1`,
        [req.user.id]
      );
    }

    const result = await queryRunner.query(
      `INSERT INTO domain_contacts (
        user_id, contact_type, first_name, last_name, organization, email, phone,
        phone_ext, fax, address_line1, address_line2, city, state, postal_code, country, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        req.user.id, contact_type, first_name, last_name, organization, email, phone,
        phone_ext, fax, address_line1, address_line2, city, state, postal_code, country, is_default
      ]
    );

    if (client) {
      await client.query('COMMIT');
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Update a contact
router.put('/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  const {
    contact_type,
    first_name,
    last_name,
    organization,
    email,
    phone,
    phone_ext,
    fax,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    is_default
  } = req.body;

  // Use transaction if setting as default to prevent race conditions
  const client = is_default ? await pool.connect() : null;

  try {
    if (client) {
      await client.query('BEGIN');
    }

    const queryRunner = client || pool;

    // Verify ownership (with row lock if using transaction)
    const existing = await queryRunner.query(
      is_default
        ? `SELECT id FROM domain_contacts WHERE id = $1 AND user_id = $2 FOR UPDATE`
        : `SELECT id FROM domain_contacts WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (!existing.rows[0]) {
      if (client) {
        await client.query('ROLLBACK');
        client.release();
      }
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as default, unset other defaults for this user
    if (is_default) {
      await queryRunner.query(
        'UPDATE domain_contacts SET is_default = false WHERE user_id = $1 AND id != $2',
        [req.user.id, id]
      );
    }

    const result = await queryRunner.query(
      `UPDATE domain_contacts SET
        contact_type = COALESCE($1, contact_type),
        first_name = COALESCE($2, first_name),
        last_name = COALESCE($3, last_name),
        organization = COALESCE($4, organization),
        email = COALESCE($5, email),
        phone = COALESCE($6, phone),
        phone_ext = COALESCE($7, phone_ext),
        fax = COALESCE($8, fax),
        address_line1 = COALESCE($9, address_line1),
        address_line2 = COALESCE($10, address_line2),
        city = COALESCE($11, city),
        state = COALESCE($12, state),
        postal_code = COALESCE($13, postal_code),
        country = COALESCE($14, country),
        is_default = COALESCE($15, is_default),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16 AND user_id = $17
      RETURNING *`,
      [
        contact_type, first_name, last_name, organization, email, phone, phone_ext,
        fax, address_line1, address_line2, city, state, postal_code, country, is_default, id, req.user.id
      ]
    );

    if (client) {
      await client.query('COMMIT');
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Delete a contact
router.delete('/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;

  try {
    // First verify ownership to prevent information disclosure
    const ownership = await pool.query(
      'SELECT id FROM domain_contacts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (!ownership.rows[0]) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Now check if contact is in use by any domains
    const inUse = await pool.query(
      `SELECT id FROM domains WHERE
        registrant_contact_id = $1 OR
        admin_contact_id = $1 OR
        tech_contact_id = $1 OR
        billing_contact_id = $1`,
      [id]
    );

    if (inUse.rows.length > 0) {
      return res.status(400).json({
        error: 'Contact is in use by one or more domains',
        domains_count: inUse.rows.length
      });
    }

    await pool.query(
      'DELETE FROM domain_contacts WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Set a contact as default
router.post('/:id/set-default', async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify ownership
    const existing = await client.query(
      `SELECT id FROM domain_contacts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, req.user.id]
    );

    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Unset all defaults for this user and set the new one in a single atomic operation
    await client.query(
      `UPDATE domain_contacts SET is_default = false WHERE user_id = $1`,
      [req.user.id]
    );

    const result = await client.query(
      `UPDATE domain_contacts SET is_default = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error setting default contact:', error);
    res.status(500).json({ error: 'Failed to set default contact' });
  } finally {
    client.release();
  }
});

module.exports = router;
