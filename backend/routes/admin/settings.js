/**
 * Admin Settings Routes
 * System settings management
 */
const express = require('express');
const router = express.Router();
const { logAudit, ROLE_LEVELS } = require('../../middleware/auth');

// Default settings schema
const DEFAULT_SETTINGS = {
  // Site settings
  site_name: 'WorxTech',
  site_tagline: 'Domain Names Made Simple',
  support_email: 'support@worxtech.biz',

  // Registration settings
  registration_enabled: 'true',
  email_verification_required: 'false',

  // Domain settings
  default_nameservers: 'ns1.worxtech.biz,ns2.worxtech.biz',
  auto_sync_enabled: 'true',
  sync_interval_hours: '24',

  // Order settings
  order_expiration_hours: '24',
  require_contact_for_checkout: 'true',

  // Notification settings
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
      expiring_domain_days: (v) => parseInt(v) >= 1 && parseInt(v) <= 90
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

module.exports = router;
