/**
 * Stripe Service
 * Handles Stripe API integration with dynamic test/production mode switching
 */

class StripeService {
  constructor() {
    // Store all keys for dynamic switching
    this.keys = {
      production: {
        secret: process.env.STRIPE_SECRET_KEY,
        publishable: process.env.STRIPE_PUBLISHABLE_KEY,
        webhook: process.env.STRIPE_WEBHOOK_SECRET
      },
      test: {
        secret: process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY,
        publishable: process.env.STRIPE_TEST_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY,
        webhook: process.env.STRIPE_TEST_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
      }
    };

    // Determine initial mode from env or default to test
    // If the secret key starts with sk_live_, we're in production
    // If it starts with sk_test_, we're in test mode
    const initialKey = process.env.STRIPE_SECRET_KEY || '';
    const initialMode = initialKey.startsWith('sk_live_') ? 'production' : 'test';

    this.setMode(process.env.STRIPE_ENV || initialMode);
  }

  /**
   * Switch between test and production mode
   * @param {string} mode - 'test' or 'production'
   */
  setMode(mode) {
    const validMode = mode === 'production' ? 'production' : 'test';
    this.mode = validMode;

    const keys = this.keys[validMode];

    // Reinitialize stripe with the appropriate key
    if (keys.secret) {
      this.stripe = require('stripe')(keys.secret);
      this.configured = true;
    } else {
      this.stripe = null;
      this.configured = false;
    }

    this.publishableKey = keys.publishable;
    this.webhookSecret = keys.webhook;

    console.log(`[Stripe] Mode set to ${validMode} (configured: ${this.configured})`);
    return { mode: validMode, configured: this.configured };
  }

  /**
   * Get current mode
   * @returns {object} Current mode info
   */
  getMode() {
    return {
      mode: this.mode,
      configured: this.configured,
      publishableKey: this.publishableKey
    };
  }

  /**
   * Get the Stripe instance
   * @returns {object|null} Stripe instance or null if not configured
   */
  getInstance() {
    return this.stripe;
  }

  /**
   * Get publishable key for frontend
   * @returns {string|null} Publishable key
   */
  getPublishableKey() {
    return this.publishableKey;
  }

  /**
   * Get webhook secret
   * @returns {string|null} Webhook secret
   */
  getWebhookSecret() {
    return this.webhookSecret;
  }

  /**
   * Check if Stripe is configured
   * @returns {boolean}
   */
  isConfigured() {
    return this.configured;
  }

  // Convenience methods that proxy to the stripe instance with error handling

  /**
   * Wrap Stripe API calls with consistent error handling
   * @private
   */
  _handleStripeError(error, operation) {
    // Stripe error types: StripeCardError, StripeRateLimitError, StripeInvalidRequestError,
    // StripeAPIError, StripeConnectionError, StripeAuthenticationError
    const stripeError = new Error(`Stripe ${operation} failed: ${error.message}`);
    stripeError.type = error.type || 'unknown';
    stripeError.code = error.code;
    stripeError.statusCode = error.statusCode;
    stripeError.originalError = error;
    throw stripeError;
  }

  async createCustomer(params) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.customers.create(params);
    } catch (error) {
      this._handleStripeError(error, 'createCustomer');
    }
  }

  async updateCustomer(customerId, params) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.customers.update(customerId, params);
    } catch (error) {
      this._handleStripeError(error, 'updateCustomer');
    }
  }

  async createPaymentIntent(params) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.paymentIntents.create(params);
    } catch (error) {
      this._handleStripeError(error, 'createPaymentIntent');
    }
  }

  async retrievePaymentIntent(id) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.paymentIntents.retrieve(id);
    } catch (error) {
      this._handleStripeError(error, 'retrievePaymentIntent');
    }
  }

  async createSetupIntent(params) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.setupIntents.create(params);
    } catch (error) {
      this._handleStripeError(error, 'createSetupIntent');
    }
  }

  async retrieveSetupIntent(id) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.setupIntents.retrieve(id);
    } catch (error) {
      this._handleStripeError(error, 'retrieveSetupIntent');
    }
  }

  async retrievePaymentMethod(id) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.paymentMethods.retrieve(id);
    } catch (error) {
      this._handleStripeError(error, 'retrievePaymentMethod');
    }
  }

  async detachPaymentMethod(id) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.paymentMethods.detach(id);
    } catch (error) {
      this._handleStripeError(error, 'detachPaymentMethod');
    }
  }

  async createRefund(params) {
    if (!this.stripe) throw new Error('Stripe not configured');
    try {
      return await this.stripe.refunds.create(params);
    } catch (error) {
      this._handleStripeError(error, 'createRefund');
    }
  }

  /**
   * Construct and verify a webhook event
   * @param {Buffer|string} body - Raw request body
   * @param {string} sig - Stripe signature header
   * @returns {Object} - Verified Stripe event object
   * @throws {Error} - If signature verification fails
   */
  constructWebhookEvent(body, sig) {
    if (!this.stripe) throw new Error('Stripe not configured');
    if (!this.webhookSecret) throw new Error('Webhook secret not configured');

    try {
      return this.stripe.webhooks.constructEvent(body, sig, this.webhookSecret);
    } catch (error) {
      const webhookError = new Error(`Webhook signature verification failed: ${error.message}`);
      webhookError.type = 'webhook_signature_error';
      webhookError.originalError = error;
      throw webhookError;
    }
  }
}

// Export singleton instance
module.exports = new StripeService();
