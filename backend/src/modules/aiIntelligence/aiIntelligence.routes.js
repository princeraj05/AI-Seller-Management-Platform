import express from 'express';
import {
  getAiOverview,
  getAiInsights,
  getAiRecommendations,
  getAiAlerts,
  askAiAssistant,
} from './aiIntelligence.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/', getAiOverview);
router.get('/insights', getAiInsights);
router.get('/recommendations', getAiRecommendations);
router.get('/alerts', getAiAlerts);
router.post('/assistant', askAiAssistant);

export default router;
