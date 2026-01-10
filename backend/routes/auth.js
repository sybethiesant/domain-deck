const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Register new user
router.post('/register', async (req, res) => {
  const {
    username, email, password, full_name, phone,
    company_name, address_line1, address_line2,
    city, state, postal_code, country
  } = req.body;
  const pool = req.app.locals.pool;

  // Input validation
  if (!username || username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Check if user exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 OR LOWER(username) = $2',
      [normalizedEmail, username.toLowerCase()]
    );

    if (userExists.rows.length > 0) {
      const existing = userExists.rows[0];
      if (existing.email.toLowerCase() === normalizedEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (
        username, email, password_hash, full_name, phone,
        company_name, address_line1, address_line2,
        city, state, postal_code, country
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, username, email, full_name, is_admin, created_at, theme_preference`,
      [
        username, normalizedEmail, password_hash,
        full_name || null, phone || null,
        company_name || null, address_line1 || null, address_line2 || null,
        city || null, state || null, postal_code || null, country || 'US'
      ]
    );

    // Generate JWT token
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Account created successfully',
      user: result.rows[0],
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const pool = req.app.locals.pool;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Clear rate limit on successful login
    const rateLimitStore = req.app.locals.rateLimitStore;
    if (rateLimitStore) {
      rateLimitStore.delete(`auth:${req.ip}`);
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        is_admin: user.is_admin,
        theme_preference: user.theme_preference || 'system'
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT id, username, email, full_name, phone, company_name,
              address_line1, address_line2, city, state, postal_code, country,
              is_admin, theme_preference, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const {
    full_name, phone, company_name,
    address_line1, address_line2, city, state, postal_code, country,
    theme_preference
  } = req.body;

  // Validation
  if (theme_preference && !['system', 'light', 'dark'].includes(theme_preference)) {
    return res.status(400).json({ error: 'Invalid theme preference' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        phone = COALESCE($2, phone),
        company_name = COALESCE($3, company_name),
        address_line1 = COALESCE($4, address_line1),
        address_line2 = COALESCE($5, address_line2),
        city = COALESCE($6, city),
        state = COALESCE($7, state),
        postal_code = COALESCE($8, postal_code),
        country = COALESCE($9, country),
        theme_preference = COALESCE($10, theme_preference),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING id, username, email, full_name, phone, company_name,
                 address_line1, address_line2, city, state, postal_code, country,
                 is_admin, theme_preference`,
      [
        full_name, phone, company_name,
        address_line1, address_line2, city, state, postal_code, country,
        theme_preference,
        req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const new_hash = await bcrypt.hash(new_password, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [new_hash, req.user.id]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
