-- Migration: Add enom_account column to domains table
-- This tracks which eNom sub-account owns each domain

ALTER TABLE domains ADD COLUMN IF NOT EXISTS enom_account VARCHAR(100) DEFAULT 'main';

-- Add TLDs for sub-account domains
INSERT INTO tld_pricing (tld, cost_register, cost_renew, cost_transfer, price_register, price_renew, price_transfer) VALUES
('construction', 25.00, 25.00, 25.00, 34.99, 34.99, 34.99),
('space', 8.99, 8.99, 8.99, 14.99, 14.99, 14.99)
ON CONFLICT (tld) DO NOTHING;
