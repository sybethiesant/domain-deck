/**
 * Email Service
 * Handles email sending with Gmail SMTP and customizable DB templates
 * Supports dynamic branding from site settings including logo
 */

const nodemailer = require('nodemailer');
const defaultTemplates = require('./templates');

// Branding cache
let brandingCache = null;
let brandingCacheTime = 0;
const BRANDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class EmailService {
  constructor() {
    this.transporter = null;
    this.pool = null;
    this.from = process.env.SMTP_FROM || 'support@worxtech.biz';
    this.fromName = process.env.SMTP_FROM_NAME || 'WorxTech';
    this.templateCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes cache

    this.initTransporter();
  }

  /**
   * Initialize the SMTP transporter
   */
  initTransporter() {
    const smtpUser = process.env.SMTP_USER || 'support@worxtech.biz';
    const smtpPass = process.env.SMTP_PASS;

    if (smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('Email: SMTP connection failed:', error.message);
          this.transporter = null;
        } else {
          console.log('Email: SMTP connected successfully via', process.env.SMTP_HOST || 'smtp.gmail.com');
        }
      });
    } else {
      console.warn('Email: No SMTP password configured. Emails will be logged to console.');
    }
  }

  /**
   * Set database pool for template fetching
   * @param {Pool} pool - PostgreSQL connection pool
   */
  setPool(pool) {
    this.pool = pool;
  }

  /**
   * Get site branding settings from database with caching
   * @returns {Promise<Object>} Branding settings
   */
  async getBranding() {
    const now = Date.now();

    // Return cached value if still valid
    if (brandingCache && (now - brandingCacheTime) < BRANDING_CACHE_TTL) {
      return brandingCache;
    }

    // Default branding
    const defaults = {
      site_name: 'WorxTech',
      company_name: 'WorxTech Internet Services LLC',
      support_email: 'support@worxtech.biz',
      site_url: process.env.FRONTEND_URL || 'https://worxtech.biz',
      email_logo_url: null,
      email_logo_background: '#4f46e5', // Default indigo gradient start
      email_header_style: 'gradient', // 'gradient', 'solid', 'logo'
      email_header_color: '#4f46e5',
      email_header_gradient_end: '#6366f1'
    };

    if (!this.pool) {
      brandingCache = defaults;
      brandingCacheTime = now;
      return brandingCache;
    }

    try {
      const result = await this.pool.query(`
        SELECT key, value FROM app_settings
        WHERE key IN (
          'site_name', 'company_name', 'support_email', 'site_url',
          'email_logo_url', 'email_logo_background', 'email_header_style',
          'email_header_color', 'email_header_gradient_end', 'logo_url'
        )
      `);

      for (const row of result.rows) {
        if (row.value) {
          defaults[row.key] = row.value;
        }
      }

      // If site logo_url exists but email_logo_url doesn't, use site logo as fallback
      if (defaults.logo_url && !defaults.email_logo_url) {
        // Construct full URL for email (emails need absolute URLs)
        const baseUrl = defaults.site_url.replace(/\/$/, '');
        // logo_url is stored as /uploads/logos/filename.png
        defaults.email_logo_url = `${baseUrl}/api${defaults.logo_url}`;
      }
    } catch (err) {
      console.error('Error fetching email branding settings:', err.message);
    }

    brandingCache = defaults;
    brandingCacheTime = now;
    return brandingCache;
  }

  /**
   * Clear branding cache (call when settings are updated)
   */
  clearBrandingCache() {
    brandingCache = null;
    brandingCacheTime = 0;
  }

  /**
   * Build email header HTML based on settings
   * @param {Object} branding - Branding settings
   * @returns {string} Header HTML
   */
  buildHeader(branding) {
    const headerStyle = branding.email_header_style || 'gradient';

    // Build background style
    let bgStyle;
    if (headerStyle === 'gradient') {
      bgStyle = `background: linear-gradient(135deg, ${branding.email_header_color || '#4f46e5'}, ${branding.email_header_gradient_end || '#6366f1'});`;
    } else {
      bgStyle = `background: ${branding.email_header_color || '#4f46e5'};`;
    }

    // If we have a logo, show it
    if (branding.email_logo_url) {
      const logoBgColor = branding.email_logo_background || '#ffffff';

      // Ensure we have an absolute URL for emails (relative paths won't work)
      let logoUrl = branding.email_logo_url;
      if (logoUrl && !logoUrl.startsWith('http')) {
        const baseUrl = (branding.site_url || 'https://worxtech.biz').replace(/\/$/, '');
        // Handle /uploads/... paths - add /api prefix for the backend route
        if (logoUrl.startsWith('/uploads/')) {
          logoUrl = `${baseUrl}/api${logoUrl}`;
        } else if (logoUrl.startsWith('/')) {
          logoUrl = `${baseUrl}${logoUrl}`;
        } else {
          logoUrl = `${baseUrl}/${logoUrl}`;
        }
      }

      return `
        <div class="header" style="${bgStyle} padding: 24px; text-align: center;">
          <div style="display: inline-block; background: ${logoBgColor}; padding: 16px 24px; border-radius: 8px;">
            <img src="${logoUrl}" alt="${branding.site_name}" style="max-height: 60px; max-width: 200px; height: auto; width: auto;" />
          </div>
        </div>
      `;
    }

    // No logo - show text
    return `
      <div class="header" style="${bgStyle} padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">${branding.site_name}</h1>
      </div>
    `;
  }

  /**
   * Base HTML wrapper for all emails with dynamic branding
   * @param {string} content - Email body content
   * @param {string} customCss - Additional CSS
   * @returns {Promise<string>} Complete HTML email
   */
  async getBaseWrapper(content, customCss = '') {
    const branding = await this.getBranding();

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${branding.site_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f1f5f9; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 32px 24px; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; padding: 12px 24px; background: ${branding.email_header_color || '#4f46e5'}; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }
    .btn:hover { opacity: 0.9; }
    .btn-success { background: #10b981; }
    .btn-warning { background: #f59e0b; }
    .highlight { background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .domain-name { font-family: monospace; font-size: 18px; font-weight: 600; color: ${branding.email_header_color || '#4f46e5'}; }
    .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .order-table th, .order-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .order-table th { background: #f8fafc; font-weight: 600; }
    .total-row { font-weight: 700; font-size: 18px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-success { background: #d1fae5; color: #065f46; }
    .status-warning { background: #fef3c7; color: #92400e; }
    .status-error { background: #fee2e2; color: #991b1b; }
    ${customCss}
  </style>
</head>
<body>
  <div class="container">
    ${this.buildHeader(branding)}
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${branding.company_name}. All rights reserved.</p>
      <p>If you have any questions, contact us at <a href="mailto:${branding.support_email}" style="color: ${branding.email_header_color || '#4f46e5'};">${branding.support_email}</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Synchronous base wrapper for backwards compatibility (uses cached branding)
   * @param {string} content - Email body content
   * @param {string} customCss - Additional CSS
   * @returns {string} Complete HTML email
   */
  getBaseWrapperSync(content, customCss = '') {
    const branding = brandingCache || {
      site_name: 'WorxTech',
      company_name: 'WorxTech Internet Services LLC',
      support_email: 'support@worxtech.biz',
      email_header_color: '#4f46e5',
      email_header_gradient_end: '#6366f1',
      email_logo_url: null,
      email_logo_background: '#ffffff'
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${branding.site_name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f1f5f9; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 32px 24px; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; padding: 12px 24px; background: ${branding.email_header_color}; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }
    .btn:hover { opacity: 0.9; }
    .btn-success { background: #10b981; }
    .btn-warning { background: #f59e0b; }
    .highlight { background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .domain-name { font-family: monospace; font-size: 18px; font-weight: 600; color: ${branding.email_header_color}; }
    .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .order-table th, .order-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .order-table th { background: #f8fafc; font-weight: 600; }
    .total-row { font-weight: 700; font-size: 18px; }
    ${customCss}
  </style>
</head>
<body>
  <div class="container">
    ${this.buildHeader(branding)}
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${branding.company_name}. All rights reserved.</p>
      <p>If you have any questions, contact us at <a href="mailto:${branding.support_email}" style="color: ${branding.email_header_color};">${branding.support_email}</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Replace template variables with values
   * @param {string} template - Template string with {{variable}} placeholders
   * @param {Object} data - Data object with variable values
   * @returns {string} - Processed template
   */
  replaceVariables(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value ?? '');
    }
    return result;
  }

  /**
   * Get template from database or fallback to default
   * @param {string} templateKey - Template key
   * @returns {Promise<Object>} - Template object with subject and html_content
   */
  async getTemplate(templateKey) {
    // Check cache first
    const cached = this.templateCache.get(templateKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.template;
    }

    // Try to fetch from database
    if (this.pool) {
      try {
        const result = await this.pool.query(
          'SELECT subject, html_content FROM email_templates WHERE template_key = $1 AND is_active = true',
          [templateKey]
        );

        if (result.rows.length > 0) {
          const template = result.rows[0];
          this.templateCache.set(templateKey, { template, timestamp: Date.now() });
          return template;
        }
      } catch (error) {
        console.error('Error fetching email template:', error.message);
      }
    }

    // Fallback to default templates
    const defaultTemplate = defaultTemplates[templateKey];
    if (defaultTemplate) {
      // Create a mock template object for compatibility
      return {
        subject: '{{subject}}', // Will be replaced by template function
        html_content: '{{content}}',
        isDefault: true,
        templateFn: defaultTemplate
      };
    }

    return null;
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.templateCache.clear();
    this.clearBrandingCache();
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} options.text - Plain text content (optional)
   * @returns {Promise<Object>} - Send result
   */
  async send({ to, subject, html, text }) {
    // Ensure branding is loaded for fromName
    const branding = await this.getBranding();
    const fromName = branding.site_name || this.fromName;

    const email = {
      from: `"${fromName}" <${this.from}>`,
      to,
      subject,
      html,
      text: text || this.stripHtml(html)
    };

    try {
      if (this.transporter) {
        const info = await this.transporter.sendMail(email);
        console.log(`Email sent to ${to}: ${info.messageId}`);
        return { success: true, provider: 'smtp', messageId: info.messageId };
      } else {
        // Console fallback for development
        console.log('\n========== EMAIL ==========');
        console.log(`To: ${to}`);
        console.log(`From: ${fromName} <${this.from}>`);
        console.log(`Subject: ${subject}`);
        console.log(`---`);
        console.log(text || this.stripHtml(html));
        console.log('============================\n');
        return { success: true, provider: 'console' };
      }
    } catch (error) {
      console.error('Email send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send using a template from database
   * @param {string} templateKey - Template key
   * @param {string} to - Recipient email
   * @param {Object} data - Template data
   * @returns {Promise<Object>} - Send result
   */
  async sendTemplate(templateKey, to, data) {
    const template = await this.getTemplate(templateKey);

    if (!template) {
      console.error(`Email template "${templateKey}" not found`);
      return { success: false, error: `Template "${templateKey}" not found` };
    }

    // Add branding data to template data for use in templates
    const branding = await this.getBranding();
    const enrichedData = {
      ...data,
      site_name: branding.site_name,
      company_name: branding.company_name,
      support_email: branding.support_email,
      site_url: branding.site_url
    };

    let subject, htmlContent;

    if (template.isDefault && template.templateFn) {
      // Use default template function
      const result = template.templateFn(enrichedData);
      subject = result.subject;
      htmlContent = result.html;
    } else {
      // Use database template
      subject = this.replaceVariables(template.subject, enrichedData);
      htmlContent = await this.getBaseWrapper(this.replaceVariables(template.html_content, enrichedData));
    }

    return this.send({ to, subject, html: htmlContent });
  }

  // Helper to strip HTML tags for plain text version
  stripHtml(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ===== CONVENIENCE METHODS =====

  async sendWelcome(to, { username }) {
    return this.sendTemplate('welcome', to, { username });
  }

  async sendPasswordReset(to, { username, resetLink, expiresIn }) {
    return this.sendTemplate('password_reset', to, { username, resetLink, expiresIn });
  }

  async sendOrderConfirmation(to, { orderNumber, items, total, username }) {
    // Validate items array
    const safeItems = Array.isArray(items) ? items : [];

    // Build items table HTML
    const itemsTable = `
      <table class="order-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>Type</th>
            <th>Years</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${safeItems.map(item => `
            <tr>
              <td class="domain-name">${item.domain_name || item.domain || 'Unknown'}</td>
              <td>${item.item_type || item.type || 'N/A'}</td>
              <td>${item.years || 1}</td>
              <td>$${parseFloat(item.total_price || item.price || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align: right;">Total:</td>
            <td>$${parseFloat(total || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    `;
    return this.sendTemplate('order_confirmation', to, { orderNumber, itemsTable, total, username });
  }

  async sendDomainRegistered(to, { domain, expirationDate, username }) {
    return this.sendTemplate('domain_registered', to, { domain, expirationDate, username });
  }

  async sendDomainExpiring(to, { domain, expirationDate, daysLeft, renewLink }) {
    return this.sendTemplate('domain_expiring', to, { domain, expirationDate, daysLeft, renewLink });
  }

  async sendOrderFailed(to, { orderNumber, items, error, username }) {
    // Validate items array
    const safeItems = Array.isArray(items) ? items : [];
    const domainsList = safeItems.length > 0
      ? `<ul>${safeItems.map(item => `<li class="domain-name">${item.domain_name || item.domain || 'Unknown domain'}</li>`).join('')}</ul>`
      : '<p>No domains specified</p>';
    return this.sendTemplate('order_failed', to, { orderNumber, domainsList, error: error || 'Unknown error', username });
  }

  async sendTransferInitiated(to, { domain, authEmail, username }) {
    return this.sendTemplate('transfer_initiated', to, { domain, authEmail, username });
  }

  async sendTransferComplete(to, { domain, username }) {
    return this.sendTemplate('transfer_complete', to, { domain, username });
  }

  async sendRenewalConfirmation(to, { domain, years, newExpiration, cost }) {
    return this.sendTemplate('renewal_confirmation', to, { domain, years, newExpiration, cost: parseFloat(cost).toFixed(2) });
  }

  async sendRenewalFailed(to, { domain, error, expirationDate }) {
    return this.sendTemplate('renewal_failed', to, { domain, error, expirationDate });
  }

  async sendEmailVerification(to, { username, verificationUrl }) {
    return this.sendTemplate('email_verification', to, { username, verificationUrl });
  }

  async sendTempPassword(to, { username, tempPassword, loginUrl }) {
    return this.sendTemplate('temp_password', to, { username, tempPassword, loginUrl });
  }

  // Admin notifications
  async sendAdminNewOrder(to, { orderNumber, customerEmail, total, itemCount }) {
    return this.sendTemplate('admin_new_order', to, { orderNumber, customerEmail, total: parseFloat(total).toFixed(2), itemCount });
  }

  async sendAdminOrderFailed(to, { orderNumber, customerEmail, error, itemCount }) {
    return this.sendTemplate('admin_order_failed', to, { orderNumber, customerEmail, error, itemCount });
  }

  /**
   * Send a test email to verify configuration
   * @param {string} to - Recipient email
   * @returns {Promise<Object>} - Send result
   */
  async sendTestEmail(to) {
    const branding = await this.getBranding();
    const html = await this.getBaseWrapper(`
      <h2>Test Email</h2>
      <p>This is a test email from ${branding.site_name} to verify your email configuration is working correctly.</p>
      <div class="highlight">
        <strong>Configuration:</strong><br>
        SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}<br>
        From: ${this.from}<br>
        Site Name: ${branding.site_name}<br>
        Company: ${branding.company_name}<br>
        Support Email: ${branding.support_email}<br>
        Logo URL: ${branding.email_logo_url || 'Not configured'}<br>
        Time: ${new Date().toISOString()}
      </div>
      <p>If you received this email, your configuration is working!</p>
    `);

    return this.send({
      to,
      subject: `${branding.site_name} Email Test`,
      html
    });
  }
}

// Export singleton instance
module.exports = new EmailService();
