-- Email Templates Table
-- Allows customizable email templates from admin UI

CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    template_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    variables TEXT[], -- List of available variables for this template
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default templates
INSERT INTO email_templates (template_key, name, description, subject, html_content, variables) VALUES
('welcome', 'Welcome Email', 'Sent when a new user registers', 'Welcome to {{site_name}}!',
'<h2>Welcome, {{username}}!</h2>
<p>Thank you for creating an account with {{site_name}}. We''re excited to help you find the perfect domain name for your next project.</p>
<div class="highlight">
  <strong>What you can do:</strong>
  <ul>
    <li>Search and register domains</li>
    <li>Manage your domain portfolio</li>
    <li>Configure nameservers and privacy</li>
    <li>Transfer your domains</li>
  </ul>
</div>
<p style="text-align: center;">
  <a href="{{site_url}}" class="btn">Start Searching</a>
</p>',
ARRAY['username', 'site_name', 'site_url']),

('password_reset', 'Password Reset', 'Sent when user requests password reset', 'Reset Your Password - {{site_name}}',
'<h2>Password Reset Request</h2>
<p>Hi {{username}},</p>
<p>We received a request to reset your password. Click the button below to create a new password:</p>
<p style="text-align: center;">
  <a href="{{resetLink}}" class="btn">Reset Password</a>
</p>
<p>This link will expire in {{expiresIn}}.</p>
<p><strong>Didn''t request this?</strong> You can safely ignore this email. Your password won''t be changed.</p>',
ARRAY['username', 'resetLink', 'expiresIn']),

('order_confirmation', 'Order Confirmation', 'Sent when order is placed successfully', 'Order Confirmed - {{orderNumber}}',
'<h2>Order Confirmed!</h2>
<p>Hi {{username}},</p>
<p>Thank you for your order. We''re processing your domain registration now.</p>
<div class="highlight">
  <strong>Order Number:</strong> {{orderNumber}}
</div>
{{itemsTable}}
<p>You''ll receive another email once your domains are ready.</p>
<p style="text-align: center;">
  <a href="{{site_url}}/orders" class="btn">View Order</a>
</p>',
ARRAY['username', 'orderNumber', 'itemsTable', 'total']),

('domain_registered', 'Domain Registered', 'Sent when domain registration completes', 'Domain Registered: {{domain}}',
'<h2><span class="status-badge status-success">Success</span></h2>
<h2>Your Domain is Ready!</h2>
<p>Hi {{username}},</p>
<p>Great news! Your domain has been successfully registered:</p>
<div class="highlight" style="text-align: center;">
  <span class="domain-name">{{domain}}</span>
  <p style="margin-top: 8px; color: #64748b;">Expires: {{expirationDate}}</p>
</div>
<p><strong>Next steps:</strong></p>
<ul>
  <li>Configure your nameservers</li>
  <li>Enable WHOIS privacy (if needed)</li>
  <li>Point your domain to your website</li>
</ul>
<p style="text-align: center;">
  <a href="{{site_url}}/dashboard" class="btn btn-success">Manage Domain</a>
</p>',
ARRAY['username', 'domain', 'expirationDate']),

('domain_expiring', 'Domain Expiring', 'Sent when domain is about to expire', 'Action Required: {{domain}} expires in {{daysLeft}} days',
'<h2><span class="status-badge status-warning">Expiring Soon</span></h2>
<h2>Domain Expiration Notice</h2>
<p>Your domain is expiring soon and requires renewal to prevent service interruption:</p>
<div class="highlight" style="text-align: center;">
  <span class="domain-name">{{domain}}</span>
  <p style="margin-top: 8px; color: #dc2626; font-weight: 600;">
    Expires in {{daysLeft}} days ({{expirationDate}})
  </p>
</div>
<p><strong>What happens if you don''t renew?</strong></p>
<ul>
  <li>Your website and email will stop working</li>
  <li>The domain may become available for others to register</li>
  <li>Recovery after expiration may cost additional fees</li>
</ul>
<p style="text-align: center;">
  <a href="{{renewLink}}" class="btn btn-warning">Renew Now</a>
</p>',
ARRAY['domain', 'daysLeft', 'expirationDate', 'renewLink']),

('order_failed', 'Order Failed', 'Sent when order processing fails', 'Order Issue - {{orderNumber}}',
'<h2><span class="status-badge status-error">Action Required</span></h2>
<h2>Order Processing Issue</h2>
<p>Hi {{username}},</p>
<p>We encountered an issue processing your order. Our team has been notified and will resolve this as soon as possible.</p>
<div class="highlight">
  <strong>Order Number:</strong> {{orderNumber}}<br>
  <strong>Issue:</strong> {{error}}
</div>
<p><strong>Affected domains:</strong></p>
{{domainsList}}
<p>No action is required from you at this time. We''ll follow up within 24 hours.</p>
<p>If you have questions, please contact {{support_email}}</p>',
ARRAY['username', 'orderNumber', 'error', 'domainsList']),

('renewal_confirmation', 'Renewal Confirmation', 'Sent when domain renewal succeeds', 'Domain Renewed: {{domain}}',
'<h2><span class="status-badge status-success">Renewed</span></h2>
<h2>Domain Renewal Successful!</h2>
<p>Your domain has been automatically renewed:</p>
<div class="highlight" style="text-align: center;">
  <span class="domain-name">{{domain}}</span>
  <p style="margin-top: 8px; color: #64748b;">
    Extended by {{years}} year(s)<br>
    New Expiration: {{newExpiration}}
  </p>
</div>
<table class="order-table">
  <tr>
    <td><strong>Domain</strong></td>
    <td class="domain-name">{{domain}}</td>
  </tr>
  <tr>
    <td><strong>Renewal Period</strong></td>
    <td>{{years}} year(s)</td>
  </tr>
  <tr>
    <td><strong>New Expiration</strong></td>
    <td>{{newExpiration}}</td>
  </tr>
  <tr class="total-row">
    <td><strong>Amount Charged</strong></td>
    <td>${{cost}}</td>
  </tr>
</table>
<p style="text-align: center;">
  <a href="{{site_url}}/dashboard" class="btn btn-success">View Domain</a>
</p>',
ARRAY['domain', 'years', 'newExpiration', 'cost']),

('renewal_failed', 'Renewal Failed', 'Sent when auto-renewal fails', 'Action Required: {{domain}} renewal failed',
'<h2><span class="status-badge status-error">Renewal Failed</span></h2>
<h2>Domain Auto-Renewal Issue</h2>
<p>We were unable to automatically renew your domain:</p>
<div class="highlight" style="text-align: center;">
  <span class="domain-name">{{domain}}</span>
  <p style="margin-top: 8px; color: #dc2626; font-weight: 600;">
    Expires: {{expirationDate}}
  </p>
</div>
<div class="highlight">
  <strong>Error:</strong> {{error}}
</div>
<p><strong>What to do:</strong></p>
<ul>
  <li>Check your payment method is up to date</li>
  <li>Manually renew before the expiration date</li>
  <li>Contact support if you need assistance</li>
</ul>
<p style="text-align: center;">
  <a href="{{site_url}}/dashboard" class="btn btn-warning">Renew Manually</a>
</p>',
ARRAY['domain', 'error', 'expirationDate']),

('transfer_initiated', 'Transfer Initiated', 'Sent when domain transfer starts', 'Transfer Started: {{domain}}',
'<h2>Domain Transfer Initiated</h2>
<p>Hi {{username}},</p>
<p>We''ve started the transfer process for your domain:</p>
<div class="highlight" style="text-align: center;">
  <span class="domain-name">{{domain}}</span>
</div>
<p><strong>What happens next:</strong></p>
<ol>
  <li>An authorization email will be sent to: <strong>{{authEmail}}</strong></li>
  <li>Click the approval link in that email</li>
  <li>The transfer typically completes within 5-7 days</li>
</ol>
<p><strong>Important:</strong> Make sure to check your spam folder for the authorization email.</p>
<p style="text-align: center;">
  <a href="{{site_url}}/orders" class="btn">Track Transfer</a>
</p>',
ARRAY['username', 'domain', 'authEmail']),

('transfer_complete', 'Transfer Complete', 'Sent when domain transfer completes', 'Transfer Complete: {{domain}}',
'<h2><span class="status-badge status-success">Complete</span></h2>
<h2>Domain Transfer Successful!</h2>
<p>Hi {{username}},</p>
<p>Your domain has been successfully transferred:</p>
<div class="highlight" style="text-align: center;">
  <span class="domain-name">{{domain}}</span>
</div>
<p>You can now manage your domain from your dashboard.</p>
<p style="text-align: center;">
  <a href="{{site_url}}/dashboard" class="btn btn-success">Manage Domain</a>
</p>',
ARRAY['username', 'domain', 'site_url']),

('admin_new_order', 'Admin: New Order', 'Sent to admin when new order received', '[Admin] New Order: {{orderNumber}}',
'<h2>New Order Received</h2>
<div class="highlight">
  <strong>Order:</strong> {{orderNumber}}<br>
  <strong>Customer:</strong> {{customerEmail}}<br>
  <strong>Items:</strong> {{itemCount}}<br>
  <strong>Total:</strong> ${{total}}
</div>
<p style="text-align: center;">
  <a href="{{site_url}}/admin/orders" class="btn">View in Admin</a>
</p>',
ARRAY['orderNumber', 'customerEmail', 'itemCount', 'total']),

('admin_order_failed', 'Admin: Order Failed', 'Sent to admin when order fails', '[Admin] Order Failed: {{orderNumber}}',
'<h2><span class="status-badge status-error">Failed</span></h2>
<h2>Order Processing Failed</h2>
<div class="highlight">
  <strong>Order:</strong> {{orderNumber}}<br>
  <strong>Customer:</strong> {{customerEmail}}<br>
  <strong>Items:</strong> {{itemCount}}<br>
  <strong>Error:</strong> {{error}}
</div>
<p>Please investigate and retry or contact the customer.</p>
<p style="text-align: center;">
  <a href="{{site_url}}/admin/orders" class="btn">View in Admin</a>
</p>',
ARRAY['orderNumber', 'customerEmail', 'itemCount', 'error'])

ON CONFLICT (template_key) DO NOTHING;

-- Email settings
INSERT INTO app_settings (key, value) VALUES
('smtp_host', 'smtp.gmail.com'),
('smtp_port', '587'),
('smtp_user', 'support@example.com'),
('smtp_from_name', 'Domain Store'),
('smtp_enabled', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
