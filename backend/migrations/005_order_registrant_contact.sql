-- Order Registrant Contact Column
-- Created: 2026-01-11
-- Purpose: Store registrant contact info with orders for domain registration

-- Add registrant_contact JSONB column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS registrant_contact JSONB;

-- Add comment for documentation
COMMENT ON COLUMN orders.registrant_contact IS 'ICANN-compliant registrant contact info for domain registration';
