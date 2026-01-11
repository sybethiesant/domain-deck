-- Add sync tracking columns to domains table
ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS enom_domain_id VARCHAR(50);

-- Add index for sync queries
CREATE INDEX IF NOT EXISTS idx_domains_last_synced ON domains(last_synced_at);

-- Update existing domains to have null last_synced_at (will trigger sync)
UPDATE domains SET last_synced_at = NULL WHERE last_synced_at IS NULL;
