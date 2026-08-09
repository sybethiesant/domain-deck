-- Migration 017: Bounded auto-refill policy
--
-- Auto-refill previously had no ceiling: smartPurchase/smartRenewal default
-- autoRefill to true and no caller passed a limit, so any order — including a
-- five-figure one — would top the reseller card up by whatever it took. This
-- adds the two bounds the refill path now enforces:
--
--   auto_refill_max_order_cost - orders worth more than this never trigger an
--                                automatic top-up; they fail for manual review
--                                so a chargeback can't be funded on our card.
--   auto_refill_max_amount     - ceiling on any single refill charge.
--
-- eNom's own $25 minimum still applies as the floor (BALANCE.MIN_REFILL).

ALTER TABLE balance_settings
  ADD COLUMN IF NOT EXISTS auto_refill_max_order_cost NUMERIC(10,2) DEFAULT 100.00;

ALTER TABLE balance_settings
  ADD COLUMN IF NOT EXISTS auto_refill_max_amount NUMERIC(10,2) DEFAULT 100.00;

-- Backfill the existing settings row so the caps are never NULL in practice.
UPDATE balance_settings
   SET auto_refill_max_order_cost = COALESCE(auto_refill_max_order_cost, 100.00),
       auto_refill_max_amount     = COALESCE(auto_refill_max_amount, 100.00);
