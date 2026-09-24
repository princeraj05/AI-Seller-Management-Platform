import express from 'express';
import { getSubscription, updateSubscriptionPlan } from './billing.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/subscription', getSubscription);
router.post('/subscribe', updateSubscriptionPlan);
router.patch('/subscribe', updateSubscriptionPlan);

export default router;
