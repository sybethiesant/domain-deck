/**
 * Email Templates
 * HTML email templates for various notifications
 */

// Base wrapper for all emails
const baseWrapper = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WorxTech</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f1f5f9; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
    .content { padding: 32px 24px; }
    .footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; padding: 12px 24px; background: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 16px 0; }
    .btn:hover { background: #4338ca; }
    .btn-success { background: #10b981; }
    .btn-warning { background: #f59e0b; }
    .highlight { background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .domain-name { font-family: monospace; font-size: 18px; font-weight: 600; color: #4f46e5; }
    .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .order-table th, .order-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .order-table th { background: #f8fafc; font-weight: 600; }
    .total-row { font-weight: 700; font-size: 18px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-success { background: #d1fae5; color: #065f46; }
    .status-warning { background: #fef3c7; color: #92400e; }
    .status-error { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>WorxTech</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} WorxTech Internet Services LLC. All rights reserved.</p>
      <p>If you have any questions, contact us at support@worxtech.biz</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = {
  // Welcome email
  welcome: ({ username }) => ({
    subject: 'Welcome to WorxTech!',
    html: baseWrapper(`
      <h2>Welcome, ${username}!</h2>
      <p>Thank you for creating an account with WorxTech. We're excited to help you find the perfect domain name for your next project.</p>
      <div class="highlight">
        <strong>What you can do:</strong>
        <ul>
          <li>Search and register domains</li>
          <li>Manage your domain portfolio</li>
          <li>Configure nameservers and privacy</li>
          <li>Transfer domains to WorxTech</li>
        </ul>
      </div>
      <p style="text-align: center;">
        <a href="https://worxtech.biz" class="btn">Start Searching</a>
      </p>
    `)
  }),

  // Email verification (uses snake_case key to match sendEmailVerification call)
  email_verification: ({ username, verificationUrl }) => ({
    subject: 'Verify Your Email - WorxTech',
    html: baseWrapper(`
      <h2>Verify Your Email Address</h2>
      <p>Hi ${username},</p>
      <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
      <p style="text-align: center;">
        <a href="${verificationUrl}" class="btn btn-success">Verify Email</a>
      </p>
      <p>This link will expire in 24 hours.</p>
      <div class="highlight">
        <p><strong>Why verify?</strong> Email verification helps us ensure the security of your account and enables important notifications about your domains.</p>
      </div>
      <p><strong>Didn't sign up?</strong> You can safely ignore this email.</p>
    `)
  }),

  // Password reset
  password_reset: ({ username, resetLink, expiresIn }) => ({
    subject: 'Reset Your Password - WorxTech',
    html: baseWrapper(`
      <h2>Password Reset Request</h2>
      <p>Hi ${username},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="${resetLink}" class="btn">Reset Password</a>
      </p>
      <p>This link will expire in ${expiresIn}.</p>
      <p><strong>Didn't request this?</strong> You can safely ignore this email. Your password won't be changed.</p>
    `)
  }),

  // Temporary password set by admin
  temp_password: ({ username, tempPassword, loginUrl }) => ({
    subject: 'Your Temporary Password - WorxTech',
    html: baseWrapper(`
      <h2>Temporary Password</h2>
      <p>Hi ${username},</p>
      <p>An administrator has set a temporary password for your account. Please use it to log in and then create a new password.</p>
      <div class="highlight" style="text-align: center;">
        <p><strong>Your temporary password:</strong></p>
        <p style="font-family: monospace; font-size: 24px; letter-spacing: 2px; color: #4f46e5; margin: 16px 0;">${tempPassword}</p>
      </div>
      <p style="text-align: center;">
        <a href="${loginUrl}" class="btn">Log In Now</a>
      </p>
      <div class="highlight" style="background: #fef3c7; border: 1px solid #f59e0b;">
        <p style="color: #92400e; margin: 0;"><strong>Important:</strong> You will be required to change this password immediately after logging in. Please choose a strong, unique password.</p>
      </div>
      <p><strong>Didn't expect this?</strong> Contact support immediately at support@worxtech.biz</p>
    `)
  }),

  // Order confirmation
  order_confirmation: ({ orderNumber, items, total, username }) => ({
    subject: `Order Confirmed - ${orderNumber}`,
    html: baseWrapper(`
      <h2>Order Confirmed!</h2>
      <p>Hi ${username},</p>
      <p>Thank you for your order. We're processing your domain registration now.</p>
      <div class="highlight">
        <strong>Order Number:</strong> ${orderNumber}
      </div>
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
          ${items.map(item => `
            <tr>
              <td class="domain-name">${item.domain_name}</td>
              <td>${item.item_type}</td>
              <td>${item.years}</td>
              <td>$${parseFloat(item.total_price).toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3" style="text-align: right;">Total:</td>
            <td>$${parseFloat(total).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p>You'll receive another email once your domains are ready.</p>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/orders" class="btn">View Order</a>
      </p>
    `)
  }),

  // Domain registered
  domain_registered: ({ domain, expirationDate, username }) => ({
    subject: `Domain Registered: ${domain}`,
    html: baseWrapper(`
      <h2><span class="status-badge status-success">Success</span></h2>
      <h2>Your Domain is Ready!</h2>
      <p>Hi ${username},</p>
      <p>Great news! Your domain has been successfully registered:</p>
      <div class="highlight" style="text-align: center;">
        <span class="domain-name">${domain}</span>
        <p style="margin-top: 8px; color: #64748b;">Expires: ${expirationDate}</p>
      </div>
      <p><strong>Next steps:</strong></p>
      <ul>
        <li>Configure your nameservers</li>
        <li>Enable WHOIS privacy (if needed)</li>
        <li>Point your domain to your website</li>
      </ul>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/dashboard" class="btn btn-success">Manage Domain</a>
      </p>
    `)
  }),

  // Domain expiring warning
  domain_expiring: ({ domain, expirationDate, daysLeft, renewLink }) => ({
    subject: `Action Required: ${domain} expires in ${daysLeft} days`,
    html: baseWrapper(`
      <h2><span class="status-badge status-warning">Expiring Soon</span></h2>
      <h2>Domain Expiration Notice</h2>
      <p>Your domain is expiring soon and requires renewal to prevent service interruption:</p>
      <div class="highlight" style="text-align: center;">
        <span class="domain-name">${domain}</span>
        <p style="margin-top: 8px; color: #dc2626; font-weight: 600;">
          Expires in ${daysLeft} days (${expirationDate})
        </p>
      </div>
      <p><strong>What happens if you don't renew?</strong></p>
      <ul>
        <li>Your website and email will stop working</li>
        <li>The domain may become available for others to register</li>
        <li>Recovery after expiration may cost additional fees</li>
      </ul>
      <p style="text-align: center;">
        <a href="${renewLink}" class="btn btn-warning">Renew Now</a>
      </p>
    `)
  }),

  // Order failed
  order_failed: ({ orderNumber, items, error, username }) => ({
    subject: `Order Issue - ${orderNumber}`,
    html: baseWrapper(`
      <h2><span class="status-badge status-error">Action Required</span></h2>
      <h2>Order Processing Issue</h2>
      <p>Hi ${username},</p>
      <p>We encountered an issue processing your order. Our team has been notified and will resolve this as soon as possible.</p>
      <div class="highlight">
        <strong>Order Number:</strong> ${orderNumber}<br>
        <strong>Issue:</strong> ${error}
      </div>
      <p><strong>Affected domains:</strong></p>
      <ul>
        ${items.map(item => `<li class="domain-name">${item.domain_name}</li>`).join('')}
      </ul>
      <p>No action is required from you at this time. We'll follow up within 24 hours.</p>
      <p>If you have questions, please contact support@worxtech.biz</p>
    `)
  }),

  // Transfer initiated
  transfer_initiated: ({ domain, authEmail, username }) => ({
    subject: `Transfer Started: ${domain}`,
    html: baseWrapper(`
      <h2>Domain Transfer Initiated</h2>
      <p>Hi ${username},</p>
      <p>We've started the transfer process for your domain:</p>
      <div class="highlight" style="text-align: center;">
        <span class="domain-name">${domain}</span>
      </div>
      <p><strong>What happens next:</strong></p>
      <ol>
        <li>An authorization email will be sent to: <strong>${authEmail}</strong></li>
        <li>Click the approval link in that email</li>
        <li>The transfer typically completes within 5-7 days</li>
      </ol>
      <p><strong>Important:</strong> Make sure to check your spam folder for the authorization email.</p>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/orders" class="btn">Track Transfer</a>
      </p>
    `)
  }),

  // Transfer complete
  transfer_complete: ({ domain, username }) => ({
    subject: `Transfer Complete: ${domain}`,
    html: baseWrapper(`
      <h2><span class="status-badge status-success">Complete</span></h2>
      <h2>Domain Transfer Successful!</h2>
      <p>Hi ${username},</p>
      <p>Your domain has been successfully transferred to WorxTech:</p>
      <div class="highlight" style="text-align: center;">
        <span class="domain-name">${domain}</span>
      </div>
      <p>You can now manage your domain from your WorxTech dashboard.</p>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/dashboard" class="btn btn-success">Manage Domain</a>
      </p>
    `)
  }),

  // Admin: New order notification
  admin_new_order: ({ orderNumber, customerEmail, total, itemCount }) => ({
    subject: `[Admin] New Order: ${orderNumber}`,
    html: baseWrapper(`
      <h2>New Order Received</h2>
      <div class="highlight">
        <strong>Order:</strong> ${orderNumber}<br>
        <strong>Customer:</strong> ${customerEmail}<br>
        <strong>Items:</strong> ${itemCount}<br>
        <strong>Total:</strong> $${parseFloat(total).toFixed(2)}
      </div>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/admin/orders" class="btn">View in Admin</a>
      </p>
    `)
  }),

  // Admin: Order failed notification
  admin_order_failed: ({ orderNumber, customerEmail, error, itemCount }) => ({
    subject: `[Admin] Order Failed: ${orderNumber}`,
    html: baseWrapper(`
      <h2><span class="status-badge status-error">Failed</span></h2>
      <h2>Order Processing Failed</h2>
      <div class="highlight">
        <strong>Order:</strong> ${orderNumber}<br>
        <strong>Customer:</strong> ${customerEmail}<br>
        <strong>Items:</strong> ${itemCount}<br>
        <strong>Error:</strong> ${error}
      </div>
      <p>Please investigate and retry or contact the customer.</p>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/admin/orders" class="btn">View in Admin</a>
      </p>
    `)
  }),

  // Domain renewal confirmation
  renewal_confirmation: ({ domain, years, newExpiration, cost }) => ({
    subject: `Domain Renewed: ${domain}`,
    html: baseWrapper(`
      <h2><span class="status-badge status-success">Renewed</span></h2>
      <h2>Domain Renewal Successful!</h2>
      <p>Your domain has been automatically renewed:</p>
      <div class="highlight" style="text-align: center;">
        <span class="domain-name">${domain}</span>
        <p style="margin-top: 8px; color: #64748b;">
          Extended by ${years} year${years > 1 ? 's' : ''}<br>
          New Expiration: ${newExpiration}
        </p>
      </div>
      <table class="order-table">
        <tr>
          <td><strong>Domain</strong></td>
          <td class="domain-name">${domain}</td>
        </tr>
        <tr>
          <td><strong>Renewal Period</strong></td>
          <td>${years} year${years > 1 ? 's' : ''}</td>
        </tr>
        <tr>
          <td><strong>New Expiration</strong></td>
          <td>${newExpiration}</td>
        </tr>
        <tr class="total-row">
          <td><strong>Amount Charged</strong></td>
          <td>$${parseFloat(cost).toFixed(2)}</td>
        </tr>
      </table>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/dashboard" class="btn btn-success">View Domain</a>
      </p>
    `)
  }),

  // Domain renewal failed
  renewal_failed: ({ domain, error, expirationDate }) => ({
    subject: `Action Required: ${domain} renewal failed`,
    html: baseWrapper(`
      <h2><span class="status-badge status-error">Renewal Failed</span></h2>
      <h2>Domain Auto-Renewal Issue</h2>
      <p>We were unable to automatically renew your domain:</p>
      <div class="highlight" style="text-align: center;">
        <span class="domain-name">${domain}</span>
        <p style="margin-top: 8px; color: #dc2626; font-weight: 600;">
          Expires: ${expirationDate}
        </p>
      </div>
      <div class="highlight">
        <strong>Error:</strong> ${error}
      </div>
      <p><strong>What to do:</strong></p>
      <ul>
        <li>Check your payment method is up to date</li>
        <li>Manually renew before the expiration date</li>
        <li>Contact support if you need assistance</li>
      </ul>
      <p style="text-align: center;">
        <a href="https://worxtech.biz/dashboard" class="btn btn-warning">Renew Manually</a>
      </p>
    `)
  })
};
