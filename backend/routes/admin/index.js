/**
 * Admin Routes Index
 * Combines all admin sub-routes into a single router
 * All routes require authentication and admin status
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../../middleware/auth');

// Apply auth and admin middleware to all admin routes
router.use(authMiddleware);
router.use(adminMiddleware);

// Import sub-routers
const statsRoutes = require('./stats');
const usersRoutes = require('./users');
const ordersRoutes = require('./orders');
const domainsRoutes = require('./domains');
const pricingRoutes = require('./pricing');
const enomRoutes = require('./enom');
const settingsRoutes = require('./settings');
const auditRoutes = require('./audit');
const rolesRoutes = require('./roles');
const balanceRoutes = require('./balance');

// Mount routes - all at root level to maintain existing API paths
router.use(statsRoutes);
router.use(usersRoutes);
router.use(ordersRoutes);
router.use(domainsRoutes);
router.use(pricingRoutes);
router.use(enomRoutes);
router.use(settingsRoutes);
router.use(auditRoutes);
router.use(rolesRoutes);
router.use('/balance', balanceRoutes);

module.exports = router;
