import mongoose from 'mongoose';
import { WebhookLog } from './webhook.model.js';
import { generatePayloadHash } from './webhook.validator.js';
import { getChannelAdapter } from '../../integrations/core/integration.factory.js';

export const inMemoryWebhookLogs = new Map();

export const processWebhookService = async (provider, headers, payload) => {
  const normProvider = (provider || 'CUSTOM_WEBSITE').toUpperCase().trim();
  const payloadHash = generatePayloadHash(normProvider, payload);

  // 1. Idempotency Protection Check
  let existing = null;
  try {
    existing = await WebhookLog.findOne({ payloadHash });
  } catch (err) {
    existing = inMemoryWebhookLogs.get(payloadHash);
  }

  if (existing) {
    return {
      status: 'DUPLICATE_IGNORED',
      message: 'Webhook event already processed previously',
      payloadHash,
    };
  }

  // 2. Delegate to Provider Adapter
  const adapter = getChannelAdapter(normProvider);
  const handleResult = await adapter.handleWebhook(headers, payload);

  const logPayload = {
    provider: normProvider,
    eventType: handleResult.eventType || 'GENERIC_EVENT',
    externalEventId: handleResult.externalEventId || `evt-${Date.now()}`,
    payloadHash,
    processed: true,
    processedAt: new Date(),
    payload,
  };

  let webhookLog = null;
  try {
    webhookLog = await WebhookLog.create(logPayload);
  } catch (err) {
    const id = new mongoose.Types.ObjectId().toString();
    webhookLog = { _id: id, ...logPayload };
    inMemoryWebhookLogs.set(payloadHash, webhookLog);
  }

  return {
    status: 'PROCESSED',
    message: 'Webhook processed successfully',
    webhookLog,
  };
};
