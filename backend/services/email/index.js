/**
 * Email Service
 * Handles email sending with templates
 * Supports SendGrid (primary) with console fallback for development
 */

const templates = require('./templates');

class EmailService {
  constructor() {
    this.provider = null;
    this.from = process.env.EMAIL_FROM || 'noreply@worxtech.biz';
    this.fromName = process.env.EMAIL_FROM_NAME || 'WorxTech';

    // Initialize SendGrid if configured
    if (process.env.SENDGRID_API_KEY) {
      this.provider = 'sendgrid';
      this.sgMail = require('@sendgrid/mail');
      this.sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    } else {
      console.warn('Email: No email provider configured. Emails will be logged to console.');
      this.provider = 'console';
    }
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
    const email = {
      to,
      from: { email: this.from, name: this.fromName },
      subject,
      html,
      text: text || this.stripHtml(html)
    };

    try {
      if (this.provider === 'sendgrid') {
        const result = await this.sgMail.send(email);
        return { success: true, provider: 'sendgrid', messageId: result[0]?.headers?.['x-message-id'] };
      } else {
        // Console fallback for development
        console.log('\n========== EMAIL ==========');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`---`);
        console.log(text || html);
        console.log('============================\n');
        return { success: true, provider: 'console' };
      }
    } catch (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send using a template
   * @param {string} templateName - Template name
   * @param {string} to - Recipient email
   * @param {Object} data - Template data
   * @returns {Promise<Object>} - Send result
   */
  async sendTemplate(templateName, to, data) {
    const template = templates[templateName];
    if (!template) {
      throw new Error(`Email template "${templateName}" not found`);
    }

    const { subject, html } = template(data);
    return this.send({ to, subject, html });
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

  // Convenience methods for common emails

  async sendWelcome(to, { username }) {
    return this.sendTemplate('welcome', to, { username });
  }

  async sendPasswordReset(to, { username, resetLink, expiresIn }) {
    return this.sendTemplate('passwordReset', to, { username, resetLink, expiresIn });
  }

  async sendOrderConfirmation(to, { orderNumber, items, total, username }) {
    return this.sendTemplate('orderConfirmation', to, { orderNumber, items, total, username });
  }

  async sendDomainRegistered(to, { domain, expirationDate, username }) {
    return this.sendTemplate('domainRegistered', to, { domain, expirationDate, username });
  }

  async sendDomainExpiring(to, { domain, expirationDate, daysLeft, renewLink }) {
    return this.sendTemplate('domainExpiring', to, { domain, expirationDate, daysLeft, renewLink });
  }

  async sendOrderFailed(to, { orderNumber, items, error, username }) {
    return this.sendTemplate('orderFailed', to, { orderNumber, items, error, username });
  }

  async sendTransferInitiated(to, { domain, authEmail, username }) {
    return this.sendTemplate('transferInitiated', to, { domain, authEmail, username });
  }

  async sendTransferComplete(to, { domain, username }) {
    return this.sendTemplate('transferComplete', to, { domain, username });
  }

  // Admin notifications

  async sendAdminNewOrder(to, { orderNumber, customerEmail, total, itemCount }) {
    return this.sendTemplate('adminNewOrder', to, { orderNumber, customerEmail, total, itemCount });
  }

  async sendAdminOrderFailed(to, { orderNumber, customerEmail, error, itemCount }) {
    return this.sendTemplate('adminOrderFailed', to, { orderNumber, customerEmail, error, itemCount });
  }
}

// Export singleton instance
module.exports = new EmailService();
