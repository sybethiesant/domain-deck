-- Migration 015: Payment integrity fixes (Audit 2026-06-11)

-- 1. Webhook idempotency. Stripe delivers events at-least-once; without a
--    processed-event record, a redelivered payment_intent.succeeded event
--    re-runs provisioning (double domain registration, double reseller-balance
--    charge). The webhook handler claims the event id here before processing.
CREATE TABLE IF NOT EXISTS processed_webhook_events (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Privacy purchases are logged against their payment intent so fulfillment
--    can be made idempotent. This column was already referenced by
--    routes/stripe.js but never existed in any migration, which made the
--    transaction-log INSERT throw after the eNom purchase succeeded — the
--    re-thrown error caused Stripe to redeliver and buy privacy twice.
ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_balance_transactions_stripe_pi ON balance_transactions(stripe_payment_intent_id);

-- 3. Defensive: order_items columns used by the fulfillment/retry paths.
--    006_fix_order_items_columns.sql adds error_message/updated_at, but the
--    duplicate-numbered migrations make it unclear which ran where.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
