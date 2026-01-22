-- Migration: Password Reset Support
-- Adds columns for password reset token management

-- Add password reset columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- Add column to track if password needs to be set (for migrated accounts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_needs_reset BOOLEAN DEFAULT false;

-- Add column to track the source of the account (normal registration vs migration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_source VARCHAR(50) DEFAULT 'registration';

-- Add column to store original eNom sub-account info for migrated accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS enom_subaccount_id VARCHAR(100);
