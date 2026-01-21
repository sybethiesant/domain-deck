-- Migration 003: Add role management and account lockout columns
-- Date: 2026-01-11

-- Add role management columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_name VARCHAR(50) DEFAULT 'customer';

-- Add account lockout columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMP;

-- Create audit_logs table (separate from activity_logs for security events)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Update existing admin users to have appropriate role_level
-- Note: SUPERADMIN is level 4 per ROLE_LEVELS constant in auth.js
UPDATE users SET role_level = 4, role_name = 'superadmin' WHERE is_admin = true AND role_level = 0;
