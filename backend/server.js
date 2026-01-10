const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// ============ SECURITY MIDDLEWARE ============

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.removeHeader('X-Powered-By');
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

app.use(cors());

// Stripe webhook needs raw body BEFORE json parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));

// Apply general rate limiting
app.use(rateLimit('general'));

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

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected successfully at', res.rows[0].now);
  }
});

// Make pool available to routes
app.locals.pool = pool;
app.locals.rateLimitStore = rateLimitStore;

// ============ ROUTES ============

const authRoutes = require('./routes/auth');
const domainRoutes = require('./routes/domains');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const stripeRoutes = require('./routes/stripe');
const adminRoutes = require('./routes/admin');

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

// ============ HEALTH CHECK ============

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: 'unknown',
    enomEnv: process.env.ENOM_ENV || 'test'
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

// ============ ERROR HANDLING ============

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ============ START SERVER ============

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WorxTech API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`eNom Environment: ${process.env.ENOM_ENV || 'test'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
