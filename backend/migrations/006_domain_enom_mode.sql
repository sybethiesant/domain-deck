-- Add enom_mode column to track which eNom environment a domain was registered in
-- Domains registered in test mode cannot be managed in production mode and vice versa

ALTER TABLE domains ADD COLUMN IF NOT EXISTS enom_mode VARCHAR(20) DEFAULT 'test';

-- Add comment to explain the column
COMMENT ON COLUMN domains.enom_mode IS 'eNom environment where domain was registered: test or production';

-- Index for filtering by mode
CREATE INDEX IF NOT EXISTS idx_domains_enom_mode ON domains(enom_mode);
