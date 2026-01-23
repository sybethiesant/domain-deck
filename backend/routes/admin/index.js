/**
 * Admin Routes Index
 * Combines all admin sub-routes into a single router
 *
 * Access Levels:
 * - Level 1+ (Support): Can view users, orders, domains and add notes
 * - Level 3+ (Admin): Can edit users, orders, domains, pricing
 * - Level 4 (Super Admin): Full access including settings, maintenance mode
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, staffMiddleware } = require('../../middleware/auth');

// Apply auth and staff middleware to all admin routes (level 1+)
// Individual routes enforce higher levels as needed
router.use(authMiddleware);
router.use(staffMiddleware);

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
