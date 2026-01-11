/**
 * Background Job Scheduler
 * Handles scheduled tasks like domain sync, expiration notifications, etc.
 */

const email = require('../email');
const enom = require('../enom');

class JobScheduler {
  constructor() {
    this.jobs = new Map();
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

    // Domain sync - every 6 hours
    this.schedule('domainSync', 6 * 60 * 60 * 1000, this.syncDomains.bind(this));

    // Expiration notifications - daily at midnight
    this.schedule('expirationNotifications', 24 * 60 * 60 * 1000, this.sendExpirationNotifications.bind(this));

    // Clean expired cart items - every hour
    this.schedule('cleanCart', 60 * 60 * 1000, this.cleanExpiredCartItems.bind(this));

    // Sync pending transfers - every 2 hours
    this.schedule('syncTransfers', 2 * 60 * 60 * 1000, this.syncPendingTransfers.bind(this));

    console.log('Job scheduler started with', this.jobs.size, 'jobs');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    this.running = false;
    for (const [name, job] of this.jobs) {
      clearInterval(job.intervalId);
      console.log(`Stopped job: ${name}`);
    }
    this.jobs.clear();
    console.log('Job scheduler stopped');
  }

  /**
   * Schedule a recurring job
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

    console.log(`Scheduled job: ${name} (every ${intervalMs / 1000}s)`);
  }

  /**
   * Run a job with error handling
   * @param {string} name - Job name
   * @param {Function} handler - Job handler
   */
  async runJob(name, handler) {
    const job = this.jobs.get(name);
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
    for (const [name, job] of this.jobs) {
      status.push({
        name,
        intervalMs: job.intervalMs,
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
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job not found: ${name}`);
    }
    await this.runJob(name, job.handler);
  }

  // ===== JOB HANDLERS =====

  /**
   * Sync domains with eNom - fetches all available data
   */
  async syncDomains() {
    if (!this.pool) return;

    // Get domains that need syncing (not synced in 6 hours)
    const result = await this.pool.query(`
      SELECT id, domain_name FROM domains
      WHERE status IN ('active', 'pending')
        AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '6 hours')
      ORDER BY last_synced_at ASC NULLS FIRST
      LIMIT 50
    `);

    console.log(`[domainSync] Found ${result.rows.length} domains to sync`);

    let synced = 0;
    let failed = 0;

    for (const domain of result.rows) {
      try {
        const parts = domain.domain_name.split('.');
        const tld = parts.pop();
        const sld = parts.join('.');

        // Fetch comprehensive data from eNom (5 API calls in parallel)
        const data = await enom.getFullDomainData(sld, tld);

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

        await this.pool.query(`
          UPDATE domains SET
            expiration_date = COALESCE($1, expiration_date),
            auto_renew = $2,
            privacy_enabled = $3,
            lock_status = $4,
            nameservers = $5,
            enom_domain_id = $6,
            status = $7,
            last_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $8
        `, [
          expDate,
          data.autoRenew,
          data.privacyEnabled,
          data.lockStatus,
          JSON.stringify(data.nameservers),
          data.domainNameId,
          status,
          domain.id
        ]);

        synced++;
        console.log(`[domainSync] Synced: ${domain.domain_name}`);
      } catch (error) {
        failed++;
        console.error(`[domainSync] Failed to sync ${domain.domain_name}:`, error.message);
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
        AND d.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${daysThreshold} days'
        AND d.auto_renew = false
      ORDER BY d.expiration_date ASC
    `);

    let sent = 0;

    for (const domain of result.rows) {
      try {
        const daysLeft = Math.ceil((new Date(domain.expiration_date) - new Date()) / (1000 * 60 * 60 * 24));

        // Only send at specific intervals: 30, 14, 7, 3, 1 days
        if ([30, 14, 7, 3, 1].includes(daysLeft)) {
          await email.sendDomainExpiring(domain.email, {
            domain: domain.domain_name,
            expirationDate: new Date(domain.expiration_date).toLocaleDateString(),
            daysLeft,
            renewLink: `https://worxtech.biz/dashboard?renew=${domain.domain_name}`
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
}

// Export singleton instance
module.exports = new JobScheduler();
