/**
 * Admin Settings Routes
 * System settings management
 */
const express = require('express');
const router = express.Router();
const { logAudit, ROLE_LEVELS } = require('../../middleware/auth');
const enom = require('../../services/enom');
const stripeService = require('../../services/stripe');
const emailService = require('../../services/email');

// File upload setup for logo
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/logos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${Date.now()}${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'image/svg+xml';
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, SVG, WebP) are allowed'));
    }
  }
});

// Default settings schema
const DEFAULT_SETTINGS = {
  // Site settings
  site_name: 'WorxTech',
  site_tagline: 'Domain Names Made Simple',
  support_email: 'support@worxtech.biz',

  // Logo settings
  logo_url: '',
  logo_width: '180',
  logo_height: '50',

  // Registration settings
  registration_enabled: 'true',
  email_verification_required: 'false',

  // API Mode settings
  enom_test_mode: 'true',
  stripe_test_mode: 'true',

  // Domain settings
  default_nameservers: 'dns1.name-services.com,dns2.name-services.com,dns3.name-services.com,dns4.name-services.com',
  suspended_nameservers: 'ns1.suspended.worxtech.biz,ns2.suspended.worxtech.biz',
  auto_sync_enabled: 'true',
  sync_interval_hours: '24',

  // Order settings
  order_expiration_hours: '24',
  require_contact_for_checkout: 'true',

  // Domain transfer settings
  push_timeout_days: '7',

  // Notification settings
  admin_notification_email: 'admin@worxtech.biz',
  admin_email_notifications: 'true',
  notify_on_new_order: 'true',
  notify_on_failed_order: 'true',
  notify_on_expiring_domains: 'true',
  expiring_domain_days: '30',

  // Maintenance
  maintenance_mode: 'false',
  maintenance_message: 'We are currently performing maintenance. Please check back soon.'
};

// Get system settings
router.get('/settings', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query('SELECT * FROM app_settings ORDER BY key');
    const settings = { ...DEFAULT_SETTINGS };

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get single setting
router.get('/settings/:key', async (req, res) => {
  const pool = req.app.locals.pool;
  const { key } = req.params;

  try {
    const result = await pool.query('SELECT * FROM app_settings WHERE key = $1', [key]);

    if (result.rows.length === 0) {
      // Return default if exists
      if (DEFAULT_SETTINGS[key] !== undefined) {
        return res.json({ key, value: DEFAULT_SETTINGS[key], isDefault: true });
      }
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update system settings (super admin only)
router.put('/settings', async (req, res) => {
  const pool = req.app.locals.pool;

  // Require super admin for settings
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const settings = req.body;
    const updated = [];
    const errors = [];

    // Validate certain settings
    const validationRules = {
      sync_interval_hours: (v) => parseInt(v) >= 1 && parseInt(v) <= 168,
      order_expiration_hours: (v) => parseInt(v) >= 1 && parseInt(v) <= 168,
      expiring_domain_days: (v) => parseInt(v) >= 1 && parseInt(v) <= 90,
      push_timeout_days: (v) => parseInt(v) >= 1 && parseInt(v) <= 30
    };

    for (const [key, value] of Object.entries(settings)) {
      // Skip if validation fails
      if (validationRules[key] && !validationRules[key](value)) {
        errors.push({ key, error: 'Invalid value' });
        continue;
      }

      try {
        await pool.query(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
          [key, String(value)]
        );
        updated.push(key);
      } catch (err) {
        errors.push({ key, error: err.message });
      }
    }

    await logAudit(pool, req.user.id, 'update_settings', 'app_settings', null, null, settings, req);

    res.json({ success: true, updated, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Update single setting
router.put('/settings/:key', async (req, res) => {
  const pool = req.app.locals.pool;
  const { key } = req.params;
  const { value, description } = req.body;

  // Require super admin for settings
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  if (value === undefined) {
    return res.status(400).json({ error: 'Value is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO app_settings (key, value, description, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = $2,
         description = COALESCE($3, app_settings.description),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [key, String(value), description]
    );

    await logAudit(pool, req.user.id, 'update_setting', 'app_settings', null, { key }, { value }, req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Delete setting (reset to default)
router.delete('/settings/:key', async (req, res) => {
  const pool = req.app.locals.pool;
  const { key } = req.params;

  // Require super admin for settings
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    await pool.query('DELETE FROM app_settings WHERE key = $1', [key]);

    await logAudit(pool, req.user.id, 'delete_setting', 'app_settings', null, { key }, null, req);

    res.json({
      success: true,
      message: 'Setting deleted (reset to default)',
      defaultValue: DEFAULT_SETTINGS[key]
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// Get maintenance status (public)
router.get('/maintenance-status', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key IN ('maintenance_mode', 'maintenance_message')"
    );

    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    res.json({
      maintenanceMode: settings.maintenance_mode === 'true',
      message: settings.maintenance_message || DEFAULT_SETTINGS.maintenance_message
    });
  } catch (error) {
    res.json({
      maintenanceMode: false,
      message: null
    });
  }
});

// Toggle maintenance mode
router.post('/maintenance', async (req, res) => {
  const pool = req.app.locals.pool;
  const { enabled, message } = req.body;

  // Require super admin
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('maintenance_mode', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [enabled ? 'true' : 'false']
    );

    if (message) {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('maintenance_message', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [message]
      );
    }

    await logAudit(pool, req.user.id, enabled ? 'enable_maintenance' : 'disable_maintenance', 'system', null, null, { message }, req);

    res.json({
      success: true,
      maintenanceMode: enabled,
      message: message || DEFAULT_SETTINGS.maintenance_message
    });
  } catch (error) {
    console.error('Error toggling maintenance mode:', error);
    res.status(500).json({ error: 'Failed to toggle maintenance mode' });
  }
});

// Get API modes (eNom and Stripe test/production status)
router.get('/api-modes', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Get current settings from database
    const result = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('enom_test_mode', 'stripe_test_mode')"
    );

    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    // Get actual service states
    const enomMode = enom.getMode();
    const stripeMode = stripeService.getMode();

    res.json({
      enom: {
        testMode: settings.enom_test_mode !== 'false',
        currentMode: enomMode.mode,
        endpoint: enomMode.endpoint,
        hasCredentials: enomMode.hasCredentials
      },
      stripe: {
        testMode: settings.stripe_test_mode !== 'false',
        currentMode: stripeMode.mode,
        configured: stripeMode.configured
      }
    });
  } catch (error) {
    console.error('Error getting API modes:', error);
    res.status(500).json({ error: 'Failed to get API modes' });
  }
});

// Set API mode (eNom or Stripe)
router.put('/api-modes', async (req, res) => {
  const pool = req.app.locals.pool;
  const { enom_test_mode, stripe_test_mode } = req.body;

  // Require super admin for API mode changes
  if (req.user.role_level < ROLE_LEVELS.SUPERADMIN && !req.user.is_admin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  try {
    const updates = [];

    // Update eNom mode
    if (enom_test_mode !== undefined) {
      const enomTestMode = enom_test_mode === true || enom_test_mode === 'true';
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('enom_test_mode', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [enomTestMode ? 'true' : 'false']
      );

      // Update the actual service
      const newMode = enom.setMode(enomTestMode ? 'test' : 'production');
      updates.push({ service: 'enom', mode: newMode.mode, endpoint: newMode.endpoint });
    }

    // Update Stripe mode
    if (stripe_test_mode !== undefined) {
      const stripeTestMode = stripe_test_mode === true || stripe_test_mode === 'true';
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('stripe_test_mode', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [stripeTestMode ? 'true' : 'false']
      );

      // Update the actual service
      const newMode = stripeService.setMode(stripeTestMode ? 'test' : 'production');
      updates.push({ service: 'stripe', mode: newMode.mode, configured: newMode.configured });
    }

    await logAudit(pool, req.user.id, 'update_api_modes', 'system', null, null, { enom_test_mode, stripe_test_mode }, req);

    res.json({
      success: true,
      updates,
      warning: 'API mode changes take effect immediately. Domains registered in one mode cannot be managed in the other mode.'
    });
  } catch (error) {
    console.error('Error updating API modes:', error);
    res.status(500).json({ error: 'Failed to update API modes' });
  }
});

// ========== EMAIL TEMPLATE MANAGEMENT ==========

// List all email templates
router.get('/email-templates', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      'SELECT * FROM email_templates ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// Get single email template
router.get('/email-templates/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const templateId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [templateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

// Update email template
router.put('/email-templates/:id', async (req, res) => {
  const pool = req.app.locals.pool;
  const templateId = parseInt(req.params.id);
  const { name, description, subject, html_content, is_active } = req.body;

  try {
    const currentTemplate = await pool.query('SELECT * FROM email_templates WHERE id = $1', [templateId]);
    if (currentTemplate.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const result = await pool.query(
      `UPDATE email_templates SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        subject = COALESCE($3, subject),
        html_content = COALESCE($4, html_content),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, description, subject, html_content, is_active, templateId]
    );

    // Clear the email service cache so it picks up the new template
    emailService.clearCache();

    await logAudit(pool, req.user.id, 'update_email_template', 'email_template', templateId,
      { subject: currentTemplate.rows[0].subject }, { subject: result.rows[0].subject }, req);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating email template:', error);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

// Send test email
router.post('/email/test', async (req, res) => {
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({ error: 'Recipient email required' });
  }

  try {
    const result = await emailService.sendTestEmail(to);
    res.json(result);
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Preview email template with sample data
router.post('/email-templates/:id/preview', async (req, res) => {
  const pool = req.app.locals.pool;
  const templateId = parseInt(req.params.id);
  const { sample_data = {} } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [templateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result.rows[0];

    // Replace variables with sample data or placeholders
    const variables = template.variables || [];
    const data = {};
    for (const v of variables) {
      data[v] = sample_data[v] || `{{${v}}}`;
    }

    const subject = emailService.replaceVariables(template.subject, data);
    const html = emailService.getBaseWrapper(emailService.replaceVariables(template.html_content, data));

    res.json({
      subject,
      html,
      variables: template.variables
    });
  } catch (error) {
    console.error('Error previewing email template:', error);
    res.status(500).json({ error: 'Failed to preview email template' });
  }
});

// Get email service status
router.get('/email/status', async (req, res) => {
  try {
    const hasTransporter = !!emailService.transporter;
    const config = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.SMTP_USER || 'support@worxtech.biz',
      from: emailService.from,
      fromName: emailService.fromName,
      connected: hasTransporter
    };
    res.json(config);
  } catch (error) {
    console.error('Error getting email status:', error);
    res.status(500).json({ error: 'Failed to get email status' });
  }
});

// ============ LOGO MANAGEMENT ============

// Upload logo
router.post('/logo', logoUpload.single('logo'), async (req, res) => {
  const pool = req.app.locals.pool;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Delete old logo if exists
    const oldLogoResult = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'logo_url'"
    );
    if (oldLogoResult.rows.length > 0 && oldLogoResult.rows[0].value) {
      const oldPath = path.join(__dirname, '../../uploads/logos', path.basename(oldLogoResult.rows[0].value));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Save new logo URL
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('logo_url', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [logoUrl]
    );

    // Get logo dimensions from request or use defaults
    const width = req.body.width || '180';
    const height = req.body.height || '50';

    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('logo_width', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [width]
    );

    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('logo_height', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [height]
    );

    // Log the action
    await logAudit(pool, req.user.id, 'logo_uploaded', 'settings', null, {
      filename: req.file.filename,
      size: req.file.size,
      width,
      height
    });

    res.json({
      success: true,
      logo_url: logoUrl,
      logo_width: width,
      logo_height: height
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    // Clean up uploaded file on error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Update logo dimensions
router.put('/logo/dimensions', async (req, res) => {
  const pool = req.app.locals.pool;
  const { width, height } = req.body;

  if (!width && !height) {
    return res.status(400).json({ error: 'Width or height required' });
  }

  try {
    if (width) {
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('logo_width', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [String(width)]
      );
    }

    if (height) {
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('logo_height', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [String(height)]
      );
    }

    await logAudit(pool, req.user.id, 'logo_dimensions_updated', 'settings', null, { width, height });

    res.json({ success: true, width, height });
  } catch (error) {
    console.error('Error updating logo dimensions:', error);
    res.status(500).json({ error: 'Failed to update logo dimensions' });
  }
});

// Delete logo
router.delete('/logo', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    // Get current logo URL
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'logo_url'"
    );

    if (result.rows.length > 0 && result.rows[0].value) {
      // Delete file
      const logoPath = path.join(__dirname, '../../uploads/logos', path.basename(result.rows[0].value));
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }

      // Clear setting
      await pool.query(
        "UPDATE app_settings SET value = '', updated_at = CURRENT_TIMESTAMP WHERE key = 'logo_url'"
      );

      await logAudit(pool, req.user.id, 'logo_deleted', 'settings', null, {
        deleted_url: result.rows[0].value
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting logo:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

// Get current logo settings
router.get('/logo', async (req, res) => {
  const pool = req.app.locals.pool;

  try {
    const result = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('logo_url', 'logo_width', 'logo_height')"
    );

    const logoSettings = {
      logo_url: '',
      logo_width: '180',
      logo_height: '50'
    };

    for (const row of result.rows) {
      logoSettings[row.key] = row.value;
    }

    res.json(logoSettings);
  } catch (error) {
    console.error('Error getting logo settings:', error);
    res.status(500).json({ error: 'Failed to get logo settings' });
  }
});

module.exports = router;
