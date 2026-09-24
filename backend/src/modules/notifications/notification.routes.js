import express from 'express';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
} from './notification.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/preferences', getNotificationPreferences);
router.patch('/preferences', updateNotificationPreferences);

router.get('/', getNotifications);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);

export default router;
