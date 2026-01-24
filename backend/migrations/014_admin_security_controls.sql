-- Admin Security Controls
-- Allows admins to force password change and require 2FA for users

-- Add columns for admin security controls
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS require_2fa BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;

-- Index for finding users who need to take action
CREATE INDEX IF NOT EXISTS idx_users_force_password_change ON users(force_password_change) WHERE force_password_change = true;
CREATE INDEX IF NOT EXISTS idx_users_require_2fa ON users(require_2fa) WHERE require_2fa = true;

-- Comments
COMMENT ON COLUMN users.force_password_change IS 'Admin-set flag requiring user to change password on next login';
COMMENT ON COLUMN users.require_2fa IS 'Admin-set flag requiring user to enable 2FA on next login';
COMMENT ON COLUMN users.password_changed_at IS 'Timestamp of last password change';
