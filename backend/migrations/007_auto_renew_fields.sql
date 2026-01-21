-- Auto-Renew Fields Migration
-- Created: 2026-01-14
-- Purpose: Add auto_renew tracking for orders and payment method storage for domains

-- Add auto_renew preference to orders (user's choice at checkout)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;

-- Add payment method ID to domains for auto-renewal charges
ALTER TABLE domains ADD COLUMN IF NOT EXISTS auto_renew_payment_method_id VARCHAR(255);

-- Comments for documentation
COMMENT ON COLUMN orders.auto_renew IS 'User preference for auto-renewal at time of purchase';
COMMENT ON COLUMN domains.auto_renew_payment_method_id IS 'Stripe payment method ID for automatic renewal charges';
