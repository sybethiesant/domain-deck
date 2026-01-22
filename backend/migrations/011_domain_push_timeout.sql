-- Domain Push Timeout Feature
-- Adds expiration tracking for pending push requests

-- Add expires_at column to domain_push_requests
ALTER TABLE domain_push_requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Add expired status
-- (status column already supports: pending, accepted, rejected, cancelled)
-- Adding 'expired' as a valid status

-- Add index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_domain_push_expires ON domain_push_requests(expires_at) WHERE status = 'pending';

-- Add push_timeout_days setting to app_settings if it doesn't exist
INSERT INTO app_settings (key, value, description)
VALUES ('push_timeout_days', '7', 'Number of days before a pending domain push request expires')
ON CONFLICT (key) DO NOTHING;

-- Update existing pending requests to have an expiration date (7 days from creation)
UPDATE domain_push_requests
SET expires_at = created_at + INTERVAL '7 days'
WHERE status = 'pending' AND expires_at IS NULL;

-- Comment explaining the feature
COMMENT ON COLUMN domain_push_requests.expires_at IS 'When this push request expires if not accepted/rejected. Set based on push_timeout_days setting.';
