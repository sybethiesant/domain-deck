const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Services
const jobScheduler = require('./services/jobs');
const emailService = require('./services/email');

const app = express();
const PORT = process.env.PORT || 5001;

// ============ SECURITY MIDDLEWARE ============

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.removeHeader('X-Powered-By');
  // Prevent caching of API responses - always fetch fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Request ID middleware for debugging
app.use((req, res, next) => {
  req.id = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});


// ============ RATE LIMITING ============

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMITS = {
  auth: 20,           // 20 auth attempts per minute
  domainCheck: 50,    // 50 domain checks per minute
  checkout: 5,        // 5 checkout attempts per minute
  general: 100        // 100 requests per minute
};

function rateLimit(type = 'general') {
  return (req, res, next) => {
    const key = `${type}:${req.ip}`;
    const now = Date.now();
    const limit = RATE_LIMITS[type] || RATE_LIMITS.general;

    // Clean up old entries
    if (rateLimitStore.size > 10000) {
      const cutoff = now - RATE_LIMIT_WINDOW;
      for (const [k, v] of rateLimitStore) {
        if (v.resetTime < cutoff) rateLimitStore.delete(k);
      }
    }

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
      rateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > limit) {
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please wait ${Math.ceil((record.resetTime - now) / 1000)} seconds.`,
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

// ============ CORE MIDDLEWARE ============

// CORS configuration - restrict to allowed origins
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://worxtech.biz', 'https://www.worxtech.biz']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Stripe webhook needs raw body BEFORE json parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));

// Debug logging for requests
app.use((req, res, next) => {
  if (req.path.includes('/auth/')) {
    console.log(`[REQ] ${req.method} ${req.path} Origin: ${req.headers.origin || 'none'}`);
  }
  next();
});

// Apply general rate limiting
app.use(rateLimit('general'));

// ============ MAINTENANCE MODE ============

// Cache maintenance status to avoid DB hits on every request
let maintenanceCache = { enabled: false, message: '', lastCheck: 0 };
const MAINTENANCE_CACHE_TTL = 5000; // 5 seconds

async function checkMaintenanceMode(pool) {
  const now = Date.now();
  if (now - maintenanceCache.lastCheck < MAINTENANCE_CACHE_TTL) {
    return maintenanceCache;
  }

  try {
    const result = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('maintenance_mode', 'maintenance_message')"
    );
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    maintenanceCache = {
      enabled: settings.maintenance_mode === 'true',
      message: settings.maintenance_message || 'We are currently performing maintenance. Please check back soon.',
      lastCheck: now
    };
  } catch (err) {
    console.error('Error checking maintenance mode:', err);
  }
  return maintenanceCache;
}

// Maintenance mode middleware
app.use(async (req, res, next) => {
  // Skip maintenance check for certain paths
  const skipPaths = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/me',
    '/api/admin',
    '/api/site-config',
    '/api/uploads',
    '/uploads'
  ];

  if (skipPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Check if pool is available yet
  if (!app.locals.pool) {
    return next();
  }

  const maintenance = await checkMaintenanceMode(app.locals.pool);

  if (!maintenance.enabled) {
    return next();
  }

  // Check if user is admin by verifying their token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if user is admin
      const userResult = await app.locals.pool.query(
        'SELECT is_admin, role_level FROM users WHERE id = $1',
        [decoded.id]
      );

      // ROLE_LEVELS.ADMIN = 3 - allow admins to bypass maintenance mode
      if (userResult.rows.length > 0 && (userResult.rows[0].is_admin || userResult.rows[0].role_level >= 3)) {
        return next(); // Allow admins through
      }
    } catch (err) {
      // Token invalid or expired, continue to block
    }
  }

  // Block non-admin users during maintenance
  res.status(503).json({
    error: 'Service Unavailable',
    maintenance: true,
    message: maintenance.message
  });
});

// ============ DATABASE ============

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'worxtech',
  user: process.env.DB_USER || 'worxtech',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection and load saved API mode settings
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully at', res.rows[0].now);

    // Load saved API mode settings and apply them
    try {
      const enom = require('./services/enom');
      const stripeService = require('./services/stripe');

      const settingsResult = await pool.query(
        "SELECT key, value FROM app_settings WHERE key IN ('enom_test_mode', 'stripe_test_mode')"
      );

      const settings = {};
      for (const row of settingsResult.rows) {
        settings[row.key] = row.value;
      }

      // Apply saved eNom mode (default to test if not set)
      const enomTestMode = settings.enom_test_mode !== 'false';
      enom.setMode(enomTestMode ? 'test' : 'production');

      // Apply saved Stripe mode (default to test if not set)
      const stripeTestMode = settings.stripe_test_mode !== 'false';
      stripeService.setMode(stripeTestMode ? 'test' : 'production');

      console.log('API modes loaded from database settings');
    } catch (settingsErr) {
      console.error('Error loading API mode settings:', settingsErr.message);
    }
  }
});

// Make pool available to routes
app.locals.pool = pool;
app.locals.rateLimitStore = rateLimitStore;

// Connect email service to database for template fetching
emailService.setPool(pool);

// Connect eNom service to database for settings queries
const enomService = require('./services/enom');
enomService.setPool(pool);

// ============ STATIC FILES ============

// Serve uploaded files (logos, etc.) with proper caching for images
// Available at both /uploads and /api/uploads for flexibility with reverse proxies
const uploadsStatic = express.static(path.join(__dirname, 'uploads'));
const uploadsMiddleware = (req, res, next) => {
  // Allow caching for uploaded images
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache
  next();
};

app.use('/uploads', uploadsMiddleware, uploadsStatic);
app.use('/api/uploads', uploadsMiddleware, uploadsStatic);

// ============ ROUTES ============

const authRoutes = require('./routes/auth');
const domainRoutes = require('./routes/domains');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const stripeRoutes = require('./routes/stripe');
const adminRoutes = require('./routes/admin/index');
const contactRoutes = require('./routes/contacts');
const noteRoutes = require('./routes/notes');

// Auth routes with stricter rate limiting
app.use('/api/auth', rateLimit('auth'), authRoutes);

// Domain routes with domain check rate limiting
app.use('/api/domains', rateLimit('domainCheck'), domainRoutes);

// Cart and order routes
app.use('/api/cart', cartRoutes);
app.use('/api/orders', rateLimit('checkout'), orderRoutes);

// Stripe routes
app.use('/api/stripe', stripeRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Contact management routes
app.use('/api/contacts', contactRoutes);

// Staff notes routes
app.use('/api/notes', noteRoutes);

// ============ HEALTH CHECK ============

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'unknown',
    enomEnv: process.env.ENOM_ENV || 'test',
    jobScheduler: jobScheduler.running ? 'running' : 'stopped'
  };

  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.database = 'connected';
    health.dbLatency = Date.now() - dbStart + 'ms';
  } catch (error) {
    health.status = 'degraded';
    health.database = 'disconnected';
    health.dbError = error.message;
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// Job scheduler status endpoint (admin only)
app.get('/api/jobs/status', require('./middleware/auth').authMiddleware, require('./middleware/auth').adminMiddleware, (req, res) => {
  res.json({
    running: jobScheduler.running,
    jobs: jobScheduler.getStatus()
  });
});

// Manually trigger a job (admin only)
app.post('/api/jobs/:name/trigger', require('./middleware/auth').authMiddleware, require('./middleware/auth').adminMiddleware, async (req, res) => {
  try {
    await jobScheduler.trigger(req.params.name);
    res.json({ success: true, message: `Job ${req.params.name} triggered` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ PUBLIC SITE CONFIG ============

// Get public site configuration (logo, site name, etc.) - no auth required
app.get('/api/site-config', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN (
        'site_name', 'site_tagline', 'logo_url', 'logo_width', 'logo_height',
        'default_theme', 'company_name', 'support_email', 'site_url'
      )`
    );
    const config = {
      site_name: 'WorxTech',
      site_tagline: 'Domain Names Made Simple',
      company_name: 'WorxTech Internet Services LLC',
      support_email: 'support@worxtech.biz',
      site_url: 'https://worxtech.biz',
      default_theme: 'dark'
    };
    for (const row of result.rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (error) {
    console.error('Error fetching site config:', error);
    res.status(500).json({ error: 'Failed to fetch site config' });
  }
});

// Get public legal page content - no auth required
app.get('/api/legal/:pageKey', async (req, res) => {
  const { pageKey } = req.params;
  const validPages = ['terms', 'privacy', 'refund'];

  if (!validPages.includes(pageKey)) {
    return res.status(404).json({ error: 'Page not found' });
  }

  try {
    const result = await pool.query(
      'SELECT page_key, title, content, updated_at FROM legal_pages WHERE page_key = $1',
      [pageKey]
    );

    if (result.rows.length === 0 || !result.rows[0].content) {
      // Return empty content - frontend will show default
      return res.json({
        page_key: pageKey,
        title: pageKey.charAt(0).toUpperCase() + pageKey.slice(1),
        content: '',
        has_custom_content: false
      });
    }

    res.json({
      ...result.rows[0],
      has_custom_content: true
    });
  } catch (error) {
    console.error('Error fetching legal page:', error);
    res.status(500).json({ error: 'Failed to fetch legal page' });
  }
});

// ============ ERROR HANDLING ============

// DEBUG: Log unmatched routes
app.use((req, res, next) => {
  require("fs").appendFileSync("/tmp/debug.log", new Date().toISOString() + " " + req.method + " " + req.path + "\n");
  next();
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]', req.method, req.path);
  console.error('[GLOBAL ERROR] Message:', err.message);
  console.error('[GLOBAL ERROR] Stack:', err.stack);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ============ START SERVER ============

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DEBUG SERVER STARTING - WorxTech API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`eNom Environment: ${process.env.ENOM_ENV || 'test'}`);

  // Initialize job scheduler with database pool
  jobScheduler.init(pool);

  // Start background jobs (disabled by default, enable with env var)
  if (process.env.ENABLE_JOB_SCHEDULER === 'true') {
    jobScheduler.start();
  } else {
    console.log('Job scheduler disabled (set ENABLE_JOB_SCHEDULER=true to enable)');
  }

  // Make email service available to routes
  app.locals.email = emailService;
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  jobScheduler.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  jobScheduler.stop();
  await pool.end();
  process.exit(0);
});
