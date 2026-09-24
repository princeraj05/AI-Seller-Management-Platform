import express from 'express';
import {
  getTrendsOverview,
  getMarketTrends,
  getProductTrends,
  getFashionTrends,
  getColorTrends,
  getOpportunities,
} from './trend.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/', getTrendsOverview);
router.get('/market', getMarketTrends);
router.get('/products', getProductTrends);
router.get('/fashion', getFashionTrends);
router.get('/colors', getColorTrends);
router.get('/opportunities', getOpportunities);

export default router;
