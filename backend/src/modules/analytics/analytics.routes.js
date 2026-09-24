import express from 'express';
import {
  getAnalyticsOverview,
  getSalesAnalytics,
  getRevenueAnalytics,
  getProfitAnalytics,
  getProductAnalytics,
  getChannelAnalytics,
} from './analytics.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/overview', getAnalyticsOverview);
router.get('/sales', getSalesAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/profit', getProfitAnalytics);
router.get('/products', getProductAnalytics);
router.get('/channels', getChannelAnalytics);

export default router;
