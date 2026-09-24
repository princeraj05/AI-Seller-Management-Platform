import express from 'express';
import { handleIncomingWebhook } from './webhook.controller.js';

const router = express.Router();

// Webhook endpoints are unauthenticated public callbacks from channels (verified via signature/hash)
router.post('/:provider', handleIncomingWebhook);
router.post('/', handleIncomingWebhook);

export default router;
