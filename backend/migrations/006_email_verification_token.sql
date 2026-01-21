-- Add email verification token column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;

-- Create index for token lookup
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token IS NOT NULL;
