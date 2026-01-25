-- Migration: Audit fixes - Configurable settings
-- Date: 2026-01-21

-- Add new configurable settings
INSERT INTO app_settings (key, value, description) VALUES
  -- Account security settings
  ('lockout_duration_minutes', '15', 'Account lockout duration in minutes after failed login attempts'),

  -- Default nameservers (JSON array)
  ('default_nameservers', '["dns1.name-services.com","dns2.name-services.com","dns3.name-services.com","dns4.name-services.com"]', 'Default nameservers for new domain registrations (JSON array)'),

  -- Site branding
  ('company_name', 'Your Company Name', 'Company legal name for footer and emails'),
  ('support_email', 'support@example.com', 'Support email address'),
  ('site_url', 'https://example.com', 'Site base URL'),

  -- Email branding
  ('email_logo_url', '', 'Logo URL for emails (leave empty to use site logo)'),
  ('email_logo_background', '#ffffff', 'Background color for email logo'),
  ('email_header_style', 'gradient', 'Email header style: gradient, solid, or logo'),
  ('email_header_color', '#4f46e5', 'Email header primary color'),
  ('email_header_gradient_end', '#6366f1', 'Email header gradient end color'),

  -- Legal pages (editable content)
  ('legal_terms_content', '', 'Terms of Service page content (HTML)'),
  ('legal_privacy_content', '', 'Privacy Policy page content (HTML)'),
  ('legal_refund_content', '', 'Refund Policy page content (HTML)')
ON CONFLICT (key) DO NOTHING;

-- Create legal_pages table for versioned content
CREATE TABLE IF NOT EXISTS legal_pages (
  id SERIAL PRIMARY KEY,
  page_key VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  last_updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default legal pages
INSERT INTO legal_pages (page_key, title, content) VALUES
  ('terms', 'Terms of Service', ''),
  ('privacy', 'Privacy Policy', ''),
  ('refund', 'Refund Policy', '')
ON CONFLICT (page_key) DO NOTHING;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_legal_pages_key ON legal_pages(page_key);
