/**
 * Background Job Scheduler
 * Handles scheduled tasks like domain sync, expiration notifications, etc.
 */

const cron = require('node-cron');
const email = require('../email');
const enom = require('../enom');

class JobScheduler {
  constructor() {
    this.jobs = new Map();
    this.cronJobs = new Map();
    this.running = false;
    this.pool = null;
  }

  /**
   * Initialize the scheduler with database pool
   * @param {Pool} pool - PostgreSQL connection pool
   */
  init(pool) {
    this.pool = pool;
    console.log('Job scheduler initialized');
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.running) {
      console.log('Job scheduler already running');
      return;
    }

    this.running = true;
    console.log('Starting job scheduler...');

    // Domain sync - every 6 hours (0:00, 6:00, 12:00, 18:00)
    this.scheduleCron('domainSync', '0 0,6,12,18 * * *', this.syncDomains.bind(this));

    // Expiration notifications - daily at midnight
    this.scheduleCron('expirationNotifications', '0 0 * * *', this.sendExpirationNotifications.bind(this));

    // Clean expired cart items - every hour
    this.scheduleCron('cleanCart', '0 * * * *', this.cleanExpiredCartItems.bind(this));

    // Sync pending transfers - every 2 hours
    this.scheduleCron('syncTransfers', '0 */2 * * *', this.syncPendingTransfers.bind(this));

    // Auto-renew domains - daily at 3 AM
    this.scheduleCron('autoRenew', '0 3 * * *', this.autoRenewDomains.bind(this));

    // Expire pending domain push requests - every hour
    this.scheduleCron('expirePushRequests', '30 * * * *', this.expirePushRequests.bind(this));

    console.log('Job scheduler started with', this.cronJobs.size, 'cron jobs');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.running = false;
    // Stop interval-based jobs
    for (const [name, job] of this.jobs) {
      clearInterval(job.intervalId);
      console.log(`Stopped interval job: ${name}`);
    }
    this.jobs.clear();

    // Stop cron-based jobs
    for (const [name, cronJob] of this.cronJobs) {
      cronJob.task.stop();
      console.log(`Stopped cron job: ${name}`);
    }
    this.cronJobs.clear();

    console.log('Job scheduler stopped');
  }

  /**
   * Schedule a cron-based job
   * @param {string} name - Job name
   * @param {string} cronExpression - Cron expression (e.g., '0 3 * * *' for 3 AM daily)
   * @param {Function} handler - Job handler function
   */
  scheduleCron(name, cronExpression, handler) {
    const task = cron.schedule(cronExpression, async () => {
      await this.runJob(name, handler);
    }, {
      scheduled: true,
      timezone: 'America/New_York' // EST/EDT timezone
    });

    this.cronJobs.set(name, {
      name,
      cronExpression,
      handler,
      task,
      lastRun: null,
      runCount: 0,
      errors: []
    });

    console.log(`Scheduled cron job: ${name} (${cronExpression}) - Timezone: America/New_York`);
  }

  /**
   * Schedule a recurring interval job (legacy method)
   * @param {string} name - Job name
   * @param {number} intervalMs - Interval in milliseconds
   * @param {Function} handler - Job handler function
   */
  schedule(name, intervalMs, handler) {
    // Run immediately, then on interval
    this.runJob(name, handler);

    const intervalId = setInterval(() => {
      this.runJob(name, handler);
    }, intervalMs);

    this.jobs.set(name, {
      name,
      intervalMs,
      handler,
      intervalId,
      lastRun: new Date(),
      runCount: 0,
      errors: []
    });

    console.log(`Scheduled interval job: ${name} (every ${intervalMs / 1000}s)`);
  }

  /**
   * Run a job with error handling
   * @param {string} name - Job name
   * @param {Function} handler - Job handler
   */
  async runJob(name, handler) {
    // Check both interval jobs and cron jobs
    const job = this.jobs.get(name) || this.cronJobs.get(name);
    const startTime = Date.now();

    try {
      console.log(`[Job] Running: ${name}`);
      await handler();

      if (job) {
        job.lastRun = new Date();
        job.runCount++;
        job.lastDuration = Date.now() - startTime;
      }

      console.log(`[Job] Completed: ${name} (${Date.now() - startTime}ms)`);
    } catch (error) {
      console.error(`[Job] Error in ${name}:`, error.message);

      if (job) {
        job.errors.push({
          time: new Date(),
          message: error.message
        });
        // Keep only last 10 errors
        if (job.errors.length > 10) {
          job.errors.shift();
        }
      }
    }
  }

  /**
   * Get job status
   * @returns {Array} - Job status array
   */
  getStatus() {
    const status = [];

    // Interval-based jobs
    for (const [name, job] of this.jobs) {
      status.push({
        name,
        type: 'interval',
        intervalMs: job.intervalMs,
        lastRun: job.lastRun,
        lastDuration: job.lastDuration,
        runCount: job.runCount,
        recentErrors: job.errors.slice(-3)
      });
    }

    // Cron-based jobs
    for (const [name, job] of this.cronJobs) {
      status.push({
        name,
        type: 'cron',
        cronExpression: job.cronExpression,
        lastRun: job.lastRun,
        lastDuration: job.lastDuration,
        runCount: job.runCount,
        recentErrors: job.errors.slice(-3)
      });
    }

    return status;
  }

  /**
   * Manually trigger a job
   * @param {string} name - Job name
   */
  async trigger(name) {
    // Check both interval and cron jobs
    const job = this.jobs.get(name) || this.cronJobs.get(name);
    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }
    await this.runJob(name, job.handler);
  }

  // ===== JOB HANDLERS =====

  /**
   * Sync domains with eNom - fetches all available data
   * Only syncs domains that match the current eNom mode
   */
  async syncDomains() {
    if (!this.pool) return;

    // Get current eNom mode
    const currentMode = enom.getMode().mode;

    // Get domains that need syncing (not synced in 6 hours) and match current mode
    const result = await this.pool.query(`
      SELECT id, domain_name, tld, enom_mode FROM domains
      WHERE status IN ('active', 'pending')
        AND (enom_mode = $1 OR enom_mode IS NULL)
        AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '6 hours')
      ORDER BY last_synced_at ASC NULLS FIRST
      LIMIT 50
    `, [currentMode]);

    console.log(`[domainSync] Found ${result.rows.length} domains to sync`);

    let synced = 0;
    let failed = 0;

    for (const domain of result.rows) {
      // Declare outside try block so they're accessible in catch for error logging
      const sld = domain.domain_name;
      const tld = domain.tld;
      const domainMode = domain.enom_mode || 'test';

      try {

        // Fetch comprehensive data from eNom (5 API calls in parallel)
        const data = await enom.getFullDomainData(sld, tld, { mode: domainMode });

        // Parse expiration date (format: "8/18/2026 11:59:00 PM")
        let expDate = null;
        if (data.expirationDate) {
          const match = data.expirationDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            expDate = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          }
        }

        // Determine status
        let status = 'active';
        if (data.status === 'Expired') {
          status = 'expired';
        } else if (expDate && new Date(expDate) < new Date()) {
          status = 'expired';
        }

        // Note: We preserve local auto_renew setting - it controls OUR renewal system,
        // separate from eNom's auto-renew which is handled at the registrar level
        await this.pool.query(`
          UPDATE domains SET
            expiration_date = COALESCE($1, expiration_date),
            privacy_enabled = $2,
            lock_status = $3,
            nameservers = $4,
            enom_domain_id = $5,
            status = $6,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $7
        `, [
          expDate,
          data.privacyEnabled,
          data.lockStatus,
          JSON.stringify(data.nameservers),
          data.domainNameId,
          status,
          domain.id
        ]);

        synced++;
        console.log(`[domainSync] Synced: ${sld}.${tld}`);
      } catch (error) {
        failed++;
        console.error(`[domainSync] Failed to sync ${sld}.${tld}:`, error.message);
      }

      // Small delay between domains to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[domainSync] Complete - Synced: ${synced}, Failed: ${failed}`);
  }

  /**
   * Send domain expiration notifications
   */
  async sendExpirationNotifications() {
    if (!this.pool) return;

    // Get setting for notification days
    const settingResult = await this.pool.query(
      "SELECT value FROM app_settings WHERE key = 'expiring_domain_days'"
    );
    const daysThreshold = parseInt(settingResult.rows[0]?.value || '30');

    // Get expiring domains
    const result = await this.pool.query(`
      SELECT d.*, u.email, u.username
      FROM domains d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'active'
        AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
        AND d.auto_renew = false
      ORDER BY d.expiration_date ASC
    `, [daysThreshold]);

    let sent = 0;

    for (const domain of result.rows) {
      try {
        const daysLeft = Math.ceil((new Date(domain.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));

        // Only send at specific intervals: 30, 14, 7, 3, 1 days
        if ([30, 14, 7, 3, 1].includes(daysLeft)) {
          const siteUrl = process.env.FRONTEND_URL || 'https://example.com';
          await email.sendDomainExpiring(domain.email, {
            domain: domain.domain_name,
            expirationDate: new Date(domain.expiration_date).toLocaleDateString(),
            daysLeft,
            renewLink: `${siteUrl}/dashboard?renew=${domain.domain_name}`
          });
          sent++;
        }
      } catch (error) {
        console.error(`Failed to send expiration notice for ${domain.domain_name}:`, error.message);
      }
    }

    console.log(`[expirationNotifications] Sent: ${sent} notifications`);
  }

  /**
   * Clean expired cart items
   */
  async cleanExpiredCartItems() {
    if (!this.pool) return;

    const result = await this.pool.query(`
      DELETE FROM cart_items WHERE expires_at < CURRENT_TIMESTAMP
      RETURNING id
    `);

    console.log(`[cleanCart] Removed: ${result.rowCount} expired cart items`);
  }

  /**
   * Sync pending domain transfers
   */
  async syncPendingTransfers() {
    if (!this.pool) return;

    // Get pending transfers
    const result = await this.pool.query(`
      SELECT * FROM domain_transfers
      WHERE status IN ('pending', 'processing')
      ORDER BY created_at ASC
    `);

    let updated = 0;

    for (const transfer of result.rows) {
      if (!transfer.enom_transfer_id) continue;

      try {
        const status = await enom.getTransferStatus(transfer.enom_transfer_id);

        // Map eNom status to our status
        let newStatus = transfer.status;
        if (status.status === 'Completed') {
          newStatus = 'completed';
        } else if (status.status === 'Cancelled' || status.status === 'Failed') {
          newStatus = 'failed';
        } else if (status.status === 'Processing' || status.status === 'Pending') {
          newStatus = 'processing';
        }

        if (newStatus !== transfer.status) {
          await this.pool.query(`
            UPDATE domain_transfers SET
              status = $1,
              transfer_completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
              error_message = $2,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [newStatus, status.statusDescription, transfer.id]);

          // If completed, update domain record
          if (newStatus === 'completed') {
            await this.pool.query(`
              UPDATE domains SET status = 'active', updated_at = CURRENT_TIMESTAMP
              WHERE domain_name = $1
            `, [transfer.domain_name]);

            // Send completion email
            const userResult = await this.pool.query(
              'SELECT email, username FROM users WHERE id = $1',
              [transfer.user_id]
            );
            if (userResult.rows[0]) {
              await email.sendTransferComplete(userResult.rows[0].email, {
                domain: transfer.domain_name,
                username: userResult.rows[0].username
              });
            }
          }

          updated++;
        }
      } catch (error) {
        console.error(`Failed to sync transfer ${transfer.enom_transfer_id}:`, error.message);
      }
    }

    console.log(`[syncTransfers] Updated: ${updated} transfers`);
  }

  /**
   * Auto-renew domains that are expiring soon and have auto_renew enabled
   * Flow: 1) Charge customer via Stripe, 2) Renew at eNom, 3) Update database
   * Only processes domains that match the current eNom mode
   */
  async autoRenewDomains() {
    if (!this.pool) return;

    // Get current eNom mode
    const currentMode = enom.getMode().mode;
    console.log(`[autoRenew] Running in ${currentMode} mode`);

    // Import stripe charger function
    const stripeRouter = require('../../routes/stripe');
    const chargeForAutoRenewal = stripeRouter.chargeForAutoRenewal;

    // Get domains expiring in the next 30 days with auto_renew enabled
    // Also check that user has a payment method on file and matches current eNom mode
    const result = await this.pool.query(`
      SELECT d.*, u.email, u.username, u.id as user_id, u.default_payment_method_id,
             d.auto_renew_payment_method_id
      FROM domains d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'active'
        AND d.auto_renew = true
        AND (d.enom_mode = $1 OR d.enom_mode IS NULL)
        AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND (u.default_payment_method_id IS NOT NULL OR d.auto_renew_payment_method_id IS NOT NULL)
      ORDER BY d.expiration_date ASC
    `, [currentMode]);

    console.log(`[autoRenew] Found ${result.rows.length} domains to auto-renew`);

    let renewed = 0;
    let failed = 0;
    let noPaymentMethod = 0;

    for (const domain of result.rows) {
      const sld = domain.domain_name;
      const tld = domain.tld;
      const fullDomain = `${sld}.${tld}`;
      const domainMode = domain.enom_mode || 'test';

      try {
        // Get renewal price from TLD pricing (customer sale price)
        const pricingResult = await this.pool.query(
          'SELECT price_renew, cost_renew FROM tld_pricing WHERE tld = $1',
          [tld]
        );
        const customerPrice = parseFloat(pricingResult.rows[0]?.price_renew || 15);
        const enomCost = parseFloat(pricingResult.rows[0]?.cost_renew || 10);

        console.log(`[autoRenew] Processing ${fullDomain} - Customer: $${customerPrice}, eNom: $${enomCost}`);

        // STEP 1: Charge customer's saved payment method
        const paymentMethodId = domain.auto_renew_payment_method_id || domain.default_payment_method_id;
        const chargeResult = await chargeForAutoRenewal(
          this.pool,
          domain.user_id,
          customerPrice,
          fullDomain,
          paymentMethodId
        );

        if (!chargeResult.success) {
          console.error(`[autoRenew] Payment failed for ${fullDomain}: ${chargeResult.error}`);

          // Disable auto-renew if card declined or requires action
          if (chargeResult.cardDeclined || chargeResult.requiresAction) {
            await this.pool.query(`
              UPDATE domains SET auto_renew = false, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [domain.id]);
            console.log(`[autoRenew] Disabled auto-renew for ${fullDomain} due to payment failure`);
          }

          // Notify customer
          await email.sendRenewalFailed(domain.email, {
            domain: fullDomain,
            error: chargeResult.error,
            expirationDate: new Date(domain.expiration_date).toLocaleDateString()
          });

          failed++;
          continue;
        }

        console.log(`[autoRenew] Payment succeeded for ${fullDomain}, proceeding with eNom renewal`);

        // STEP 2: Renew at eNom using reseller balance (with auto-refill)
        const renewResult = await enom.smartRenewal(sld, tld, 1, enomCost, { mode: domainMode });

        if (!renewResult.success) {
          // Payment succeeded but eNom failed - this needs manual resolution
          console.error(`[autoRenew] eNom renewal failed for ${fullDomain} after payment succeeded!`);

          // Log for manual resolution
          await this.pool.query(`
            INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            domain.user_id,
            'auto_renewal_enom_failed',
            'domain',
            domain.id,
            JSON.stringify({
              domain: fullDomain,
              stripePaymentIntent: chargeResult.paymentIntentId,
              customerCharged: customerPrice,
              error: renewResult.error || 'eNom renewal failed',
              requiresManualResolution: true
            })
          ]);

          failed++;
          continue;
        }

        // STEP 3: Update database
        const newExpDate = renewResult.renewResult?.newExpiration;
        if (newExpDate) {
          await this.pool.query(`
            UPDATE domains SET
              expiration_date = $1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [newExpDate, domain.id]);
        }

        // Log the transaction
        await this.pool.query(`
          INSERT INTO balance_transactions
          (transaction_type, amount, domain_name, auto_refill, notes, stripe_payment_intent_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'renewal',
          customerPrice,
          fullDomain,
          renewResult.refillResult ? true : false,
          'Auto-renewal (customer charged via Stripe)',
          chargeResult.paymentIntentId
        ]);

        // Send confirmation email
        try {
          await email.sendRenewalConfirmation(domain.email, {
            domain: fullDomain,
            years: 1,
            newExpiration: newExpDate ? new Date(newExpDate).toLocaleDateString() : 'N/A',
            cost: customerPrice
          });
          console.log(`[autoRenew] Renewal confirmation email sent for ${fullDomain}`);
        } catch (emailError) {
          console.error(`[autoRenew] Failed to send renewal confirmation email:`, emailError.message);
        }

        renewed++;
        console.log(`[autoRenew] Successfully renewed ${fullDomain}`);

      } catch (error) {
        failed++;
        console.error(`[autoRenew] Failed to renew ${fullDomain}:`, error.message);

        // Send failure notification
        try {
          await email.sendRenewalFailed(domain.email, {
            domain: fullDomain,
            error: error.message,
            expirationDate: new Date(domain.expiration_date).toLocaleDateString()
          });
        } catch (emailError) {
          console.error(`[autoRenew] Failed to send failure email:`, emailError.message);
        }
      }

      // Delay between renewals to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Log domains that couldn't be auto-renewed due to no payment method
    const noPaymentResult = await this.pool.query(`
      SELECT d.domain_name, d.tld, d.expiration_date, u.email
      FROM domains d
      JOIN users u ON d.user_id = u.id
      WHERE d.status = 'active'
        AND d.auto_renew = true
        AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND u.default_payment_method_id IS NULL
        AND d.auto_renew_payment_method_id IS NULL
    `);

    if (noPaymentResult.rows.length > 0) {
      console.log(`[autoRenew] ${noPaymentResult.rows.length} domains have auto-renew but no payment method`);
      for (const d of noPaymentResult.rows) {
        // Notify customer they need to add a payment method
        try {
          await email.sendRenewalFailed(d.email, {
            domain: `${d.domain_name}.${d.tld}`,
            error: 'No payment method on file. Please add a payment method to enable auto-renewal.',
            expirationDate: new Date(d.expiration_date).toLocaleDateString()
          });
        } catch (e) {
          console.error(`[autoRenew] Failed to send no-payment-method email:`, e.message);
        }
        noPaymentMethod++;
      }
    }

    console.log(`[autoRenew] Complete - Renewed: ${renewed}, Failed: ${failed}, No Payment Method: ${noPaymentMethod}`);
  }

  /**
   * Expire pending domain push requests that have passed their expiration date
   */
  async expirePushRequests() {
    if (!this.pool) {
      console.error('[expirePush] No database pool available');
      return;
    }

    console.log('[expirePush] Checking for expired push requests...');

    try {
      // Find and expire all pending requests that have passed their expires_at date
      const result = await this.pool.query(`
        UPDATE domain_push_requests
        SET status = 'expired', responded_at = CURRENT_TIMESTAMP
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < CURRENT_TIMESTAMP
        RETURNING id, domain_id, from_user_id, to_user_id
      `);

      if (result.rows.length > 0) {
        console.log(`[expirePush] Expired ${result.rows.length} push request(s)`);

        // Log each expired request
        for (const expired of result.rows) {
          // Get domain info for logging
          const domainResult = await this.pool.query(
            'SELECT domain_name, tld FROM domains WHERE id = $1',
            [expired.domain_id]
          );

          if (domainResult.rows[0]) {
            const domain = domainResult.rows[0];
            console.log(`[expirePush] Expired push for ${domain.domain_name}.${domain.tld} (request #${expired.id})`);
          }
        }
      } else {
        console.log('[expirePush] No expired push requests found');
      }
    } catch (error) {
      console.error('[expirePush] Error expiring push requests:', error.message);
    }
  }
}

// Export singleton instance
module.exports = new JobScheduler();
