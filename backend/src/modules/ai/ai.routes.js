import express from 'express';
import { generateProductAI } from './ai.controller.js';
import { analyzeProductImage } from './vision.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';
import { uploadProductImageMiddleware } from '../../middleware/imageUploadMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.post('/generate-product', generateProductAI);
router.post('/analyze-image', uploadProductImageMiddleware, analyzeProductImage);

export default router;
