const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
// Dummy hash for timing-safe comparison when user not found
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const jwt = require('jsonwebtoken');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const emailService = require('../services/email');
const { AUTH } = require('../config/constants');

// Helper to check if email verification is required
async function isEmailVerificationRequired(pool) {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'email_verification_required'"
    );
    return result.rows.length > 0 && result.rows[0].value === 'true';
  } catch (err) {
    return false;
  }
}

// Helper to get account lockout duration from settings (in minutes)
async function getLockoutDuration(pool) {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'lockout_duration_minutes'"
    );
    if (result.rows.length > 0) {
      const minutes = parseInt(result.rows[0].value);
      if (!isNaN(minutes) && minutes > 0) return minutes;
    }
  } catch (err) {
    // Fall back to default
  }
  return AUTH.LOCKOUT_DURATION_MINUTES;
}

// Generate verification token
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}
// Password strength validation - security fix
function validatePassword(password) {
  if (!password || password.length < 12) {
    return 'Password must be at least 12 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}



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

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  // Validate required personal info fields
  if (!full_name || full_name.trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required' });
  }

  if (!phone || phone.trim().length < 7) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  if (!address_line1 || address_line1.trim().length < 3) {
    return res.status(400).json({ error: 'Street address is required' });
  }

  if (!city || city.trim().length < 2) {
    return res.status(400).json({ error: 'City is required' });
  }

  if (!state || state.trim().length < 2) {
    return res.status(400).json({ error: 'State/Province is required' });
  }

  if (!postal_code || postal_code.trim().length < 3) {
    return res.status(400).json({ error: 'Postal code is required' });
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

    // Check if email verification is required
    const verificationRequired = await isEmailVerificationRequired(pool);
    let verificationToken = null;
    let verificationExpires = null;

    if (verificationRequired) {
      verificationToken = generateVerificationToken();
      verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }

    // Create user
    const result = await pool.query(
      `INSERT INTO users (
        username, email, password_hash, full_name, phone,
        company_name, address_line1, address_line2,
        city, state, postal_code, country,
        email_verified, verification_token, verification_token_expires
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, username, email, full_name, is_admin, role_level, role_name, created_at, theme_preference, email_verified`,
      [
        username, normalizedEmail, password_hash,
        full_name || null, phone || null,
        company_name || null, address_line1 || null, address_line2 || null,
        city || null, state || null, postal_code || null, country || 'US',
        !verificationRequired, // email_verified: true if verification not required
        verificationToken,
        verificationExpires
      ]
    );

    // Send verification email if required, otherwise send welcome email
    if (verificationRequired) {
      try {
        const verificationUrl = `${process.env.FRONTEND_URL || 'https://worxtech.biz'}/verify-email?token=${verificationToken}`;
        await emailService.sendEmailVerification(normalizedEmail, {
          username: result.rows[0].username,
          verificationUrl
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError.message);
      }

      // Don't return JWT token - user must verify email first
      return res.status(201).json({
        message: 'Account created! Please check your email to verify your account.',
        requiresVerification: true
      });
    }

    // Generate JWT token (only if verification not required)
    const token = jwt.sign(
      { id: result.rows[0].id, username: result.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: AUTH.JWT_EXPIRY }
    );

    // Send welcome email
    try {
      await emailService.sendWelcome(normalizedEmail, {
        username: result.rows[0].username
      });
    } catch (emailError) {
      // Don't fail registration if email fails
      console.error('Failed to send welcome email:', emailError.message);
    }

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


    const user = result.rows[0] || null;

    // Always perform bcrypt comparison to prevent timing attacks
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;

    // Check for account lockout
    if (user && user.lockout_until && new Date(user.lockout_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.lockout_until) - new Date()) / 60000);
      return res.status(429).json({ 
        error: 'Account temporarily locked due to too many failed login attempts',
        minutes_remaining: remainingMinutes
      });
    }

    const validPassword = await bcrypt.compare(password, hashToCompare);

    if (!user || !validPassword) {
      // Increment failed login attempts (only if user exists)
      if (user) {
        const attempts = (user.failed_login_attempts || 0) + 1;
        let lockoutUntil = null;
        let lockoutMinutes = null;

        // Lock account after configured failed attempts
        if (attempts >= AUTH.LOCKOUT_ATTEMPTS) {
          lockoutMinutes = await getLockoutDuration(pool);
          lockoutUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
        }

        await pool.query(
          'UPDATE users SET failed_login_attempts = $1, lockout_until = $2 WHERE id = $3',
          [attempts, lockoutUntil, user.id]
        );

        if (lockoutUntil) {
          return res.status(429).json({
            error: 'Account temporarily locked due to too many failed login attempts',
            minutes_remaining: lockoutMinutes
          });
        }
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if email verification is required and user hasn't verified
    const verificationRequired = await isEmailVerificationRequired(pool);
    if (verificationRequired && !user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email address before logging in',
        requiresVerification: true,
        email: user.email
      });
    }

    // Check if admin requires 2FA and user hasn't set it up yet
    if (user.require_2fa && !user.totp_enabled) {
      // Generate a temporary token for 2FA setup requirement
      const setupToken = jwt.sign(
        { id: user.id, purpose: '2fa_setup_required' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      return res.json({
        message: 'Two-factor authentication setup required',
        requires2FASetup: true,
        setupToken
      });
    }

    // Check if 2FA is enabled
    if (user.totp_enabled) {
      // Generate a temporary token for 2FA verification (short-lived)
      const twoFactorToken = jwt.sign(
        { id: user.id, purpose: '2fa_pending' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );

      return res.json({
        message: 'Two-factor authentication required',
        requires2FA: true,
        twoFactorToken
      });
    }

    // Reset failed login attempts on successful login
    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP, failed_login_attempts = 0, lockout_until = NULL WHERE id = $1',
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: AUTH.JWT_EXPIRY }
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
        role_level: user.role_level || 0,
        role_name: user.role_name || 'customer',
        theme_preference: user.theme_preference || 'system',
        totp_enabled: user.totp_enabled || false,
        force_password_change: user.force_password_change || false
      },
      token,
      forcePasswordChange: user.force_password_change || false
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Verify email address
router.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  const pool = req.app.locals.pool;

  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  try {
    // Find user with this token
    const result = await pool.query(
      `SELECT id, username, email, verification_token_expires, email_verified
       FROM users WHERE verification_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Check if token has expired
    if (user.verification_token_expires && new Date(user.verification_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
    }

    // Verify the email
    await pool.query(
      `UPDATE users SET
        email_verified = true,
        email_verified_at = CURRENT_TIMESTAMP,
        verification_token = NULL,
        verification_token_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    // Generate JWT token so user can log in immediately
    const authToken = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: AUTH.JWT_EXPIRY }
    );

    // Send welcome email now that they're verified
    try {
      await emailService.sendWelcome(user.email, { username: user.username });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError.message);
    }

    res.json({
      message: 'Email verified successfully! You can now log in.',
      token: authToken
    });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  const pool = req.app.locals.pool;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Find user
    const result = await pool.query(
      'SELECT id, username, email, email_verified FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({ message: 'If an account exists with this email, a verification link has been sent.' });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new token
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await pool.query(
      `UPDATE users SET
        verification_token = $1,
        verification_token_expires = $2
       WHERE id = $3`,
      [verificationToken, verificationExpires, user.id]
    );

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://worxtech.biz'}/verify-email?token=${verificationToken}`;
    await emailService.sendEmailVerification(user.email, {
      username: user.username,
      verificationUrl
    });

    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (error) {
    console.error('Error resending verification:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      `SELECT id, username, email, full_name, phone, company_name,
              address_line1, address_line2, city, state, postal_code, country,
              is_admin, role_level, role_name, theme_preference, created_at, email_verified
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows[0]) {
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
                 is_admin, role_level, role_name, theme_preference`,
      [
        full_name, phone, company_name,
        address_line1, address_line2, city, state, postal_code, country,
        theme_preference,
        req.user.id
      ]
    );


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

  const newPasswordError = validatePassword(new_password);
  if (newPasswordError) {
    return res.status(400).json({ error: newPasswordError });
  }

  try {
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(current_password, result.rows[0].password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const new_hash = await bcrypt.hash(new_password, 10);

    await pool.query(
      `UPDATE users SET
        password_hash = $1,
        force_password_change = false,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [new_hash, req.user.id]
    );

    res.json({ message: 'Password updated successfully', forcePasswordChange: false });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Request password reset (forgot password)
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const pool = req.app.locals.pool;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Find user by email
    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    await pool.query(
      `UPDATE users SET
        password_reset_token = $1,
        password_reset_expires = $2
       WHERE id = $3`,
      [resetToken, resetExpires, user.id]
    );

    // Send password reset email
    const resetLink = `${process.env.FRONTEND_URL || 'https://worxtech.biz'}/reset-password?token=${resetToken}`;

    try {
      await emailService.sendPasswordReset(user.email, {
        username: user.username,
        resetLink,
        expiresIn: '1 hour'
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError.message);
    }

    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  const { token, new_password } = req.body;
  const pool = req.app.locals.pool;

  if (!token || !new_password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  const passwordError = validatePassword(new_password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  try {
    // Find user with this reset token
    const result = await pool.query(
      `SELECT id, username, email, password_reset_expires, password_needs_reset
       FROM users WHERE password_reset_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];

    // Check if token has expired
    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash new password
    const password_hash = await bcrypt.hash(new_password, 10);

    // Update password and clear reset token
    // Also mark email as verified (password reset verifies email ownership)
    await pool.query(
      `UPDATE users SET
        password_hash = $1,
        password_reset_token = NULL,
        password_reset_expires = NULL,
        password_needs_reset = false,
        email_verified = true,
        email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [password_hash, user.id]
    );

    // Generate JWT token so user can log in immediately
    const authToken = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: AUTH.JWT_EXPIRY }
    );

    res.json({
      message: 'Password has been reset successfully. You are now logged in.',
      token: authToken
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Check reset token validity (for frontend to verify before showing form)
router.get('/verify-reset-token', async (req, res) => {
  const { token } = req.query;
  const pool = req.app.locals.pool;

  if (!token) {
    return res.status(400).json({ error: 'Token is required', valid: false });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_reset_expires
       FROM users WHERE password_reset_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.json({ valid: false, error: 'Invalid reset token' });
    }

    const user = result.rows[0];

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return res.json({ valid: false, error: 'Reset token has expired' });
    }

    res.json({ valid: true, email: user.email });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ valid: false, error: 'Failed to verify token' });
  }
});

// ============ TWO-FACTOR AUTHENTICATION ============

// Setup 2FA - Generate secret and QR code
router.post('/2fa/setup', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Check if 2FA is already enabled
    const userResult = await pool.query(
      'SELECT totp_enabled, totp_secret FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows[0].totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    // Generate a new secret
    const secret = authenticator.generateSecret();

    // Get site name from settings
    const siteResult = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'site_name'"
    );
    const siteName = siteResult.rows[0]?.value || 'WorxTech';

    // Get user email
    const emailResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    const userEmail = emailResult.rows[0].email;

    // Generate OTP auth URL
    const otpauth = authenticator.keyuri(userEmail, siteName, secret);

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled yet)
    await pool.query(
      'UPDATE users SET totp_secret = $1 WHERE id = $2',
      [secret, req.user.id]
    );

    res.json({
      secret,
      qrCode,
      message: 'Scan the QR code with your authenticator app, then verify with a code'
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

// Verify and enable 2FA
router.post('/2fa/verify', authMiddleware, async (req, res) => {
  const { code } = req.body;
  const pool = req.app.locals.pool;

  if (!code) {
    return res.status(400).json({ error: 'Verification code is required' });
  }

  try {
    const userResult = await pool.query(
      'SELECT totp_secret, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    if (!user.totp_secret) {
      return res.status(400).json({ error: 'Please setup 2FA first' });
    }

    if (user.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    // Verify the code
    const isValid = authenticator.verify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate backup codes
    const backupCodes = [];
    const hashedBackupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    // Enable 2FA
    await pool.query(
      `UPDATE users SET
        totp_enabled = true,
        totp_verified_at = CURRENT_TIMESTAMP,
        backup_codes = $1
       WHERE id = $2`,
      [JSON.stringify(hashedBackupCodes), req.user.id]
    );

    res.json({
      message: '2FA has been enabled successfully',
      backupCodes,
      warning: 'Save these backup codes in a safe place. They can be used to access your account if you lose your authenticator.'
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// Disable 2FA
router.post('/2fa/disable', authMiddleware, async (req, res) => {
  const { password, code } = req.body;
  const pool = req.app.locals.pool;

  if (!password) {
    return res.status(400).json({ error: 'Password is required to disable 2FA' });
  }

  try {
    const userResult = await pool.query(
      'SELECT password_hash, totp_secret, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    if (!user.totp_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify TOTP code if provided
    if (code) {
      const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }
    }

    // Disable 2FA
    await pool.query(
      `UPDATE users SET
        totp_enabled = false,
        totp_secret = NULL,
        totp_verified_at = NULL,
        backup_codes = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    res.json({ message: '2FA has been disabled' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Authenticate with 2FA code (complete login)
router.post('/2fa/authenticate', async (req, res) => {
  const { twoFactorToken, code } = req.body;
  const pool = req.app.locals.pool;

  if (!twoFactorToken || !code) {
    return res.status(400).json({ error: 'Two-factor token and code are required' });
  }

  try {
    // Verify the temporary 2FA token
    let decoded;
    try {
      decoded = jwt.verify(twoFactorToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired two-factor token. Please login again.' });
    }

    if (decoded.purpose !== '2fa_pending') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // First try TOTP code
    let isValid = authenticator.verify({ token: code, secret: user.totp_secret });

    // If TOTP fails, try backup codes
    if (!isValid && user.backup_codes) {
      const backupCodes = JSON.parse(user.backup_codes);
      for (let i = 0; i < backupCodes.length; i++) {
        const match = await bcrypt.compare(code.toUpperCase(), backupCodes[i]);
        if (match) {
          isValid = true;
          // Remove used backup code
          backupCodes.splice(i, 1);
          await pool.query(
            'UPDATE users SET backup_codes = $1 WHERE id = $2',
            [JSON.stringify(backupCodes), user.id]
          );
          break;
        }
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    // Reset failed login attempts
    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP, failed_login_attempts = 0, lockout_until = NULL WHERE id = $1',
      [user.id]
    );

    // Generate full auth token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: AUTH.JWT_EXPIRY }
    );

    // Clear rate limit
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
        role_level: user.role_level || 0,
        role_name: user.role_name || 'customer',
        theme_preference: user.theme_preference || 'system',
        totp_enabled: user.totp_enabled || false,
        force_password_change: user.force_password_change || false
      },
      token,
      forcePasswordChange: user.force_password_change || false
    });
  } catch (error) {
    console.error('2FA authenticate error:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// Get 2FA status
router.get('/2fa/status', authMiddleware, async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      'SELECT totp_enabled, totp_verified_at, backup_codes FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];
    const backupCodesRemaining = user.backup_codes ? JSON.parse(user.backup_codes).length : 0;

    res.json({
      enabled: user.totp_enabled || false,
      enabledAt: user.totp_verified_at,
      backupCodesRemaining
    });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// Regenerate backup codes
router.post('/2fa/regenerate-backup-codes', authMiddleware, async (req, res) => {
  const { password } = req.body;
  const pool = req.app.locals.pool;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    const userResult = await pool.query(
      'SELECT password_hash, totp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];

    if (!user.totp_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate new backup codes
    const backupCodes = [];
    const hashedBackupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    await pool.query(
      'UPDATE users SET backup_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedBackupCodes), req.user.id]
    );

    res.json({
      message: 'Backup codes regenerated',
      backupCodes,
      warning: 'Your old backup codes are no longer valid. Save these new codes in a safe place.'
    });
  } catch (error) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({ error: 'Failed to regenerate backup codes' });
  }
});

module.exports = router;
