/**
 * Application Constants
 * Centralized configuration for commonly used values
 */

module.exports = {
  // Pricing defaults
  PRICING: {
    DEFAULT_PRIVACY_PRICE: 9.99,
    DEFAULT_MARKUP: 1.3,
    DEFAULT_ROUND_TO: 0.99,
    MIN_YEARS: 1,
    MAX_YEARS: 10
  },

  // Rate limiting
  RATE_LIMITS: {
    WINDOW_MS: 60 * 1000, // 1 minute
    AUTH_MAX: 20,         // Auth endpoints
    DOMAIN_CHECK_MAX: 50, // Domain availability checks
    GENERAL_MAX: 100      // General API endpoints
  },

  // Balance management
  BALANCE: {
    MIN_THRESHOLD: 50.00,
    DEFAULT_REFILL_AMOUNT: 100.00,
    LOW_BALANCE_ALERT: 25.00,
    MIN_REFILL: 25.00
  },

  // Cache TTLs (milliseconds)
  CACHE: {
    MAINTENANCE_TTL: 5000,      // 5 seconds
    TLD_PRICING_TTL: 300000,    // 5 minutes
    DOMAIN_SUGGESTIONS_TTL: 60000 // 1 minute
  },

  // Pagination defaults
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },

  // Session/Token
  AUTH: {
    JWT_EXPIRY: '7d',
    PASSWORD_RESET_EXPIRY: '1h',
    EMAIL_VERIFY_EXPIRY: '24h'
  },

  // Cart
  CART: {
    ITEM_EXPIRY_HOURS: 24,
    MAX_ITEMS: 20
  }
};
