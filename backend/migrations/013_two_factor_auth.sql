-- Two-Factor Authentication Support
-- Adds TOTP (Time-based One-Time Password) support for user accounts

-- Add 2FA columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes JSONB;

-- Index for quick lookup of 2FA enabled users
CREATE INDEX IF NOT EXISTS idx_users_totp_enabled ON users(totp_enabled) WHERE totp_enabled = true;

-- Comment explaining the columns
COMMENT ON COLUMN users.totp_secret IS 'Base32 encoded TOTP secret for 2FA';
COMMENT ON COLUMN users.totp_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN users.totp_verified_at IS 'When 2FA was first verified and enabled';
COMMENT ON COLUMN users.backup_codes IS 'Array of hashed backup codes for account recovery';
