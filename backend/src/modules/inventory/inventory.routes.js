import express from 'express';
import {
  getInventory,
  getInventoryLedger,
  adjustStock,
  reserveStock,
  releaseReservation,
} from './inventory.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/', getInventory);
router.get('/ledger', getInventoryLedger);
router.post('/adjust', adjustStock);
router.post('/reserve', reserveStock);
router.post('/release', releaseReservation);

export default router;
