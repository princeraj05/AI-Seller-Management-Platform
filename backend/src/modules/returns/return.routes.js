import express from 'express';
import {
  createReturn,
  getReturns,
  getReturnById,
  inspectReturn,
} from './return.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.post('/', createReturn);
router.get('/', getReturns);
router.get('/:id', getReturnById);
router.patch('/:id/items/:itemId/inspect', inspectReturn);

export default router;
