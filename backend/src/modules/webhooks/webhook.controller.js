import { processWebhookService } from './webhook.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const handleIncomingWebhook = async (req, res) => {
  try {
    const provider = req.params.provider || req.body.provider || 'CUSTOM_WEBSITE';
    const result = await processWebhookService(provider, req.headers, req.body);
    return successResponse(res, 200, 'Webhook received', result);
  } catch (error) {
    console.error('Webhook Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to process webhook');
  }
};
