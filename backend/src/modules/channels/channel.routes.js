import express from 'express';
import {
  connectChannel,
  getChannels,
  getChannelById,
  disconnectChannel,
  testChannelConnection,
  syncChannel,
  publishProductToChannel,
  getChannelHealth,
} from './channel.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

router.get('/health', getChannelHealth);
router.get('/', getChannels);
router.post('/connect', connectChannel);
router.post('/:provider/connect', connectChannel);
router.get('/:id', getChannelById);
router.post('/:id/disconnect', disconnectChannel);
router.post('/:id/test', testChannelConnection);
router.post('/:id/sync', syncChannel);
router.post('/publish/:productId/:channelId', publishProductToChannel);

export default router;
