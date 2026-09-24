import express from 'express';
import { checkoutPOS, getPOSBills, getPOSBillById } from './pos.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.post('/checkout', checkoutPOS);
router.get('/bills', getPOSBills);
router.get('/bills/:id', getPOSBillById);

export default router;
