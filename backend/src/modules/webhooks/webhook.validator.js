import crypto from 'crypto';

export const validateWebhookSignature = (headers, payload, secret) => {
  if (!secret) return true; // Signature verification optional if secret not configured

  const signature = headers['x-webhook-signature'] || headers['x-shopify-hmac-sha256'] || headers['x-hub-signature'];
  if (!signature) return false;

  const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const computed = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');

  return signature.includes(computed) || computed.includes(signature);
};

export const generatePayloadHash = (provider, payload) => {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(`${provider}_${str}`).digest('hex');
};
