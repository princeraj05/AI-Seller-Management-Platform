import express from 'express';
import { submitOnboarding } from './onboarding.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  authorizeRoles('seller', 'admin'),
  submitOnboarding
);

export default router;
