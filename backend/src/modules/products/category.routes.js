import express from 'express';
import { getCategories, createCategory } from './category.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', getCategories);
router.post('/', createCategory);

export default router;
