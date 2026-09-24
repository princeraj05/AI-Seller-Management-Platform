import express from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
} from './order.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.post('/', createOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);

export default router;
