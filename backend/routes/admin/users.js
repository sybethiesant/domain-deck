/**
 * Admin User Management Routes
 * User listing, details, and role management
 *
 * Access Levels:
 * - Level 1+: View users and details, add notes
 * - Level 3+: Edit users, change roles, send password resets
 * - Level 4: Delete users, impersonate
 */
const express = require('express');
const router = express.Router();
const { logAudit, ROLE_LEVELS } = require('../../middleware/auth');

// List all users with pagination and search
router.get('/users', async (req, res) => {
  const pool = req.app.locals.pool;
  const { page = 1, limit = 50, search, role, sort = 'created_at', order = 'desc' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const allowedSorts = ['created_at', 'last_login_at', 'username', 'email'];
    const sortColumn = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.is_admin,
             u.role_level, u.role_name, u.created_at, u.last_login_at,
             u.email_verified, u.phone, u.company_name,
             COUNT(DISTINCT d.id) as domain_count,
             COUNT(DISTINCT o.id) as order_count,
             COALESCE(SUM(o.total), 0) as total_spent
      FROM users u
      LEFT JOIN domains d ON u.id = d.user_id
      LEFT JOIN orders o ON u.id = o.user_id AND o.payment_status = 'paid'
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.username ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`;
    }

    if (role) {
      params.push(role);
      query += ` AND u.role_name = $${params.length}`;
    }

    query += ` GROUP BY u.id ORDER BY u.${sortColumn} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams = [];
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (username ILIKE $${countParams.length} OR email ILIKE $${countParams.length} OR full_name ILIKE $${countParams.length})`;
    }
    if (role) {
      countParams.push(role);
      countQuery += ` AND role_name = $${countParams.length}`;
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user details
router.get('/users/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);

  try {
    const userResult = await pool.query(
      `SELECT id, username, email, full_name, phone, company_name,
              address_line1, address_line2, city, state, postal_code, country,
              is_admin, role_level, role_name, email_verified, email_verified_at,
              stripe_customer_id, theme_preference,
              totp_enabled, totp_verified_at, force_password_change, require_2fa,
              password_changed_at, created_at, last_login_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's domains
    const domainsResult = await pool.query(
      `SELECT id, domain_name, tld, status, expiration_date, auto_renew, privacy_enabled
       FROM domains WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    // Get user's orders
    const ordersResult = await pool.query(
      `SELECT id, order_number, status, payment_status, total, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    // Get user's contacts
    const contactsResult = await pool.query(
      `SELECT id, contact_type, first_name, last_name, email, is_default
       FROM domain_contacts WHERE user_id = $1 ORDER BY is_default DESC`,
      [userId]
    );

    // Get staff notes about this user
    const notesResult = await pool.query(
      `SELECT sn.*, u.username as staff_username
       FROM staff_notes sn
       LEFT JOIN users u ON sn.staff_user_id = u.id
       WHERE sn.entity_type = 'user' AND sn.entity_id = $1
       ORDER BY sn.is_pinned DESC, sn.created_at DESC`,
      [userId]
    );

    // Get recent activity
    const activityResult = await pool.query(
      `SELECT action, entity_type, entity_id, details, created_at
       FROM activity_logs WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    res.json({
      ...userResult.rows[0],
      domains: domainsResult.rows,
      recentOrders: ordersResult.rows,
      contacts: contactsResult.rows,
      notes: notesResult.rows,
      recentActivity: activityResult.rows
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user (full profile editing for admins)
// Requires level 3+ (Admin)
router.put('/users/:id', async (req, res) => {
  // Check admin level
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required to edit users' });
  }

  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const {
    // Role/admin fields
    is_admin, role_level, role_name, email_verified,
    // Profile fields
    full_name, email, phone, company_name,
    address_line1, address_line2, city, state, postal_code, country,
    theme_preference
  } = req.body;

  try {
    // Get current user data for audit
    const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldValues = currentUser.rows[0];

    // Check if trying to set a role higher than or equal to own role
    if (role_level !== undefined && role_level >= req.user.role_level && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot assign role equal to or higher than your own' });
    }

    // Cannot demote yourself
    if (userId === req.user.id && role_level !== undefined && role_level < req.user.role_level) {
      return res.status(403).json({ error: 'Cannot demote yourself' });
    }

    // Validate email format if provided
    if (email !== undefined && email !== null) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      // Check for duplicate email
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email.toLowerCase(), userId]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use by another account' });
      }
    }

    const result = await pool.query(
      `UPDATE users SET
        is_admin = COALESCE($1, is_admin),
        role_level = COALESCE($2, role_level),
        role_name = COALESCE($3, role_name),
        email_verified = COALESCE($4, email_verified),
        email_verified_at = CASE WHEN $4 = true AND email_verified = false THEN CURRENT_TIMESTAMP ELSE email_verified_at END,
        full_name = COALESCE($5, full_name),
        email = COALESCE(LOWER($6), email),
        phone = COALESCE($7, phone),
        company_name = COALESCE($8, company_name),
        address_line1 = COALESCE($9, address_line1),
        address_line2 = COALESCE($10, address_line2),
        city = COALESCE($11, city),
        state = COALESCE($12, state),
        postal_code = COALESCE($13, postal_code),
        country = COALESCE($14, country),
        theme_preference = COALESCE($15, theme_preference),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $16
       RETURNING id, username, email, full_name, phone, company_name,
                 address_line1, address_line2, city, state, postal_code, country,
                 is_admin, role_level, role_name, email_verified, theme_preference`,
      [is_admin, role_level, role_name, email_verified,
       full_name, email, phone, company_name,
       address_line1, address_line2, city, state, postal_code, country,
       theme_preference, userId]
    );

    const newValues = result.rows[0];

    // Log the audit with all changed fields
    await logAudit(pool, req.user.id, 'update_user', 'user', userId, oldValues, newValues, req);

    res.json(newValues);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Disable/Enable user account
// Requires level 3+ (Admin)
router.post('/users/:id/toggle-status', async (req, res) => {
  // Check admin level
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { disabled, reason } = req.body;

  try {
    if (userId === req.user.id) {
      return res.status(403).json({ error: 'Cannot disable your own account' });
    }

    const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For now, we'll use is_admin = false and add a note
    // In future, add a 'disabled' column to users table
    const result = await pool.query(
      `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [userId]
    );

    // Add staff note about the action
    if (reason) {
      await pool.query(
        `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
         VALUES ('user', $1, $2, $3, true)`,
        [userId, req.user.id, `Account ${disabled ? 'disabled' : 'enabled'}: ${reason}`]
      );
    }

    await logAudit(pool, req.user.id, disabled ? 'disable_user' : 'enable_user', 'user', userId, null, { reason }, req);

    res.json({ success: true, message: `User account ${disabled ? 'disabled' : 'enabled'}` });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Send password reset email to user (for migrations)
// Requires level 3+ (Admin)
router.post('/users/:id/send-reset', async (req, res) => {
  // Check admin level
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { id } = req.params;
  const pool = req.app.locals.pool;

  try {
    const userResult = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for migrations

    // Store token
    await pool.query(
      `UPDATE users SET
        password_reset_token = $1,
        password_reset_expires = $2
       WHERE id = $3`,
      [resetToken, resetExpires, user.id]
    );

    // Send password reset email
    const emailService = require('../../services/email');
    const resetLink = `${process.env.FRONTEND_URL || 'https://worxtech.biz'}/reset-password?token=${resetToken}`;

    await emailService.sendPasswordReset(user.email, {
      username: user.username,
      resetLink,
      expiresIn: '7 days'
    });

    await logAudit(pool, req.user.id, 'send_password_reset', 'user', parseInt(id), null, { email: user.email }, req);

    res.json({ success: true, message: 'Password reset email sent' });
  } catch (error) {
    console.error('Error sending password reset:', error);
    res.status(500).json({ error: 'Failed to send password reset email' });
  }
});

// Get user's saved contacts (for admin to use when editing domain WHOIS)
router.get('/users/:id/contacts', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      `SELECT id, contact_type, first_name, last_name, organization, email, phone,
              phone_ext, fax, address_line1, address_line2, city, state, postal_code,
              country, is_default, created_at
       FROM domain_contacts
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Set temporary password for user
// Requires level 3+ (Admin)
router.post('/users/:id/set-temp-password', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { password, sendEmail = false, reason } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Cannot set password on users with equal or higher role level
    if (targetUser.role_level >= req.user.role_level && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot modify users with equal or higher role level' });
    }

    // Generate random password if not provided
    const crypto = require('crypto');
    const tempPassword = password || crypto.randomBytes(8).toString('base64').replace(/[+/=]/g, '').substring(0, 12);

    // Validate password length
    if (tempPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Hash the password
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Update password and force change on next login
    await pool.query(
      `UPDATE users SET
        password_hash = $1,
        force_password_change = true,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    // Add staff note
    await pool.query(
      `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
       VALUES ('user', $1, $2, $3, true)`,
      [userId, req.user.id, `Temporary password set by admin${reason ? ': ' + reason : ''}. Password change required on next login.`]
    );

    // Optionally send email with temp password
    if (sendEmail) {
      try {
        const emailService = require('../../services/email');
        await emailService.sendTempPassword(targetUser.email, {
          username: targetUser.username,
          tempPassword,
          loginUrl: process.env.FRONTEND_URL || 'https://worxtech.biz'
        });
      } catch (emailErr) {
        console.error('Failed to send temp password email:', emailErr);
        // Don't fail the request if email fails
      }
    }

    await logAudit(pool, req.user.id, 'set_temp_password', 'user', userId,
      null, { force_password_change: true, email_sent: sendEmail }, req);

    res.json({
      success: true,
      tempPassword: sendEmail ? undefined : tempPassword, // Only return if not emailed
      message: sendEmail
        ? 'Temporary password set and emailed to user'
        : 'Temporary password set. User must change it on next login.'
    });
  } catch (error) {
    console.error('Error setting temp password:', error);
    res.status(500).json({ error: 'Failed to set temporary password' });
  }
});

// Force password change for user
// Requires level 3+ (Admin)
router.post('/users/:id/force-password-change', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { enabled = true, reason } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Cannot force password change on users with equal or higher role level
    if (targetUser.role_level >= req.user.role_level && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot modify users with equal or higher role level' });
    }

    await pool.query(
      'UPDATE users SET force_password_change = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [enabled, userId]
    );

    // Add staff note
    if (reason) {
      await pool.query(
        `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
         VALUES ('user', $1, $2, $3, false)`,
        [userId, req.user.id, `Password change ${enabled ? 'required' : 'cleared'}: ${reason}`]
      );
    }

    await logAudit(pool, req.user.id, enabled ? 'force_password_change' : 'clear_password_change', 'user', userId,
      { force_password_change: targetUser.force_password_change },
      { force_password_change: enabled }, req);

    res.json({
      success: true,
      message: enabled ? 'User must change password on next login' : 'Password change requirement cleared'
    });
  } catch (error) {
    console.error('Error setting force password change:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Require 2FA setup for user
// Requires level 3+ (Admin)
router.post('/users/:id/require-2fa', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { enabled = true, reason } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Cannot require 2FA on users with equal or higher role level
    if (targetUser.role_level >= req.user.role_level && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot modify users with equal or higher role level' });
    }

    // If user already has 2FA enabled, no need to require it
    if (enabled && targetUser.totp_enabled) {
      return res.json({ success: true, message: 'User already has 2FA enabled' });
    }

    await pool.query(
      'UPDATE users SET require_2fa = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [enabled, userId]
    );

    // Add staff note
    if (reason) {
      await pool.query(
        `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
         VALUES ('user', $1, $2, $3, false)`,
        [userId, req.user.id, `2FA ${enabled ? 'required' : 'requirement cleared'}: ${reason}`]
      );
    }

    await logAudit(pool, req.user.id, enabled ? 'require_2fa' : 'clear_2fa_requirement', 'user', userId,
      { require_2fa: targetUser.require_2fa },
      { require_2fa: enabled }, req);

    res.json({
      success: true,
      message: enabled ? 'User must enable 2FA on next login' : '2FA requirement cleared'
    });
  } catch (error) {
    console.error('Error setting require 2FA:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset/disable 2FA for user (help locked out users)
// Requires level 3+ (Admin)
router.post('/users/:id/reset-2fa', async (req, res) => {
  if (req.user.role_level < ROLE_LEVELS.ADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);
  const { reason } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Cannot reset 2FA on users with equal or higher role level
    if (targetUser.role_level >= req.user.role_level && !req.user.is_admin) {
      return res.status(403).json({ error: 'Cannot modify users with equal or higher role level' });
    }

    if (!targetUser.totp_enabled) {
      return res.json({ success: true, message: 'User does not have 2FA enabled' });
    }

    // Disable 2FA completely
    await pool.query(
      `UPDATE users SET
        totp_enabled = false,
        totp_secret = NULL,
        totp_verified_at = NULL,
        backup_codes = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    // Add staff note
    await pool.query(
      `INSERT INTO staff_notes (entity_type, entity_id, staff_user_id, note, is_pinned)
       VALUES ('user', $1, $2, $3, true)`,
      [userId, req.user.id, `2FA disabled by admin${reason ? ': ' + reason : ''}`]
    );

    await logAudit(pool, req.user.id, 'admin_reset_2fa', 'user', userId,
      { totp_enabled: true },
      { totp_enabled: false, reason }, req);

    res.json({
      success: true,
      message: '2FA has been disabled for this user. They can set it up again from their settings.'
    });
  } catch (error) {
    console.error('Error resetting 2FA:', error);
    res.status(500).json({ error: 'Failed to reset 2FA' });
  }
});

// Impersonate user (super admin only)
router.post('/users/:id/impersonate', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);

  // Require super admin
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const userResult = await pool.query(
      'SELECT id, username, email, is_admin, role_level, role_name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      {
        id: userId,
        username: userResult.rows[0].username,
        impersonatedBy: req.user.id
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await logAudit(pool, req.user.id, 'impersonate_user', 'user', userId, null, null, req);

    res.json({
      token,
      user: userResult.rows[0],
      message: 'Impersonation session started (1 hour limit)'
    });
  } catch (error) {
    console.error('Error impersonating user:', error);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
});

// Delete user (super admin only)
router.delete('/users/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = parseInt(req.params.id);

  // Require super admin (role_level >= 4)
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  // Cannot delete yourself
  if (userId === req.user.id) {
    return res.status(403).json({ error: 'Cannot delete your own account' });
  }

  try {
    // Get user to be deleted
    const userResult = await pool.query(
      'SELECT id, username, email, role_level FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Cannot delete users with equal or higher role level
    if (targetUser.role_level >= req.user.role_level) {
      return res.status(403).json({ error: 'Cannot delete users with equal or higher role level' });
    }

    // Check for domains owned by this user
    const domainsResult = await pool.query(
      'SELECT COUNT(*) as count FROM domains WHERE user_id = $1',
      [userId]
    );

    if (parseInt(domainsResult.rows[0].count) > 0) {
      return res.status(400).json({
        error: `Cannot delete user with ${domainsResult.rows[0].count} domain(s). Transfer or delete domains first.`
      });
    }

    // Check for unpaid orders
    const ordersResult = await pool.query(
      "SELECT COUNT(*) as count FROM orders WHERE user_id = $1 AND payment_status != 'paid'",
      [userId]
    );

    if (parseInt(ordersResult.rows[0].count) > 0) {
      return res.status(400).json({
        error: `Cannot delete user with ${ordersResult.rows[0].count} unpaid order(s).`
      });
    }

    // Delete related data (cascade should handle most, but be explicit)
    await pool.query('DELETE FROM domain_contacts WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM saved_payment_methods WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    // Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    // Audit log
    const { logAudit } = require('../../middleware/auth');
    await logAudit(pool, req.user.id, 'delete_user', 'user', userId,
      { username: targetUser.username, email: targetUser.email }, null, req);

    res.json({
      success: true,
      message: `User ${targetUser.username} (${targetUser.email}) has been deleted`
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
