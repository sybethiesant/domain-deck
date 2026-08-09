/**
 * Auto-refill policy for the eNom reseller balance.
 *
 * The purchase paths (register / renew / transfer) top the reseller balance up
 * automatically when an order costs more than the balance on hand. That has to
 * be bounded in two independent ways:
 *
 *   maxOrderCost     - the largest order we are willing to auto-fund at all.
 *                      A high-value order is the one most worth charging back,
 *                      and funding it would put our own card behind a payment
 *                      that can still be reversed. Above this, fulfillment
 *                      stops and the order is flagged for a human.
 *   maxRefillAmount  - the largest single charge we will put on the reseller
 *                      card, independent of what the order needs.
 *
 * Both are admin-adjustable (Admin -> Balance). Falls back to the conservative
 * constants if the settings row or columns are missing, so a partially applied
 * migration cannot silently unbound the refill.
 */
const { BALANCE } = require('../config/constants');

async function getAutoRefillPolicy(pool) {
  const fallback = {
    autoRefill: false,
    maxOrderCost: BALANCE.DEFAULT_MAX_ORDER_COST,
    maxRefillAmount: BALANCE.DEFAULT_MAX_REFILL_AMOUNT,
    minRefill: BALANCE.MIN_REFILL
  };

  try {
    const result = await pool.query(
      `SELECT auto_refill_enabled, auto_refill_max_order_cost, auto_refill_max_amount
         FROM balance_settings
        ORDER BY id DESC
        LIMIT 1`
    );

    if (result.rows.length === 0) return fallback;

    const row = result.rows[0];
    const maxOrderCost = parseFloat(row.auto_refill_max_order_cost);
    const maxRefillAmount = parseFloat(row.auto_refill_max_amount);

    return {
      autoRefill: row.auto_refill_enabled === true,
      maxOrderCost: Number.isFinite(maxOrderCost) ? maxOrderCost : fallback.maxOrderCost,
      maxRefillAmount: Number.isFinite(maxRefillAmount) ? maxRefillAmount : fallback.maxRefillAmount,
      minRefill: BALANCE.MIN_REFILL
    };
  } catch (error) {
    // Never let a settings lookup failure widen the limits.
    console.error('Auto-refill policy lookup failed, using conservative defaults:', error.message);
    return fallback;
  }
}

module.exports = { getAutoRefillPolicy };
