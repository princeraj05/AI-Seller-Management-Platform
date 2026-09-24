import express from 'express';
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from './product.controller.js';
import {
  createVariant,
  getVariants,
  updateVariant,
  deleteVariant,
} from './productVariant.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/variants', getVariants);
router.post('/', createProduct);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.patch('/:id', updateProduct);
router.delete('/:id', deleteProduct);

router.get('/:productId/variants', getVariants);
router.post('/:productId/variants', createVariant);
router.patch('/:productId/variants/:variantId', updateVariant);
router.delete('/:productId/variants/:variantId', deleteVariant);

export default router;
