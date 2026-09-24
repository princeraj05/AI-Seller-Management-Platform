export const handleWooCommerceWebhookNotification = async (headers, payload) => {
  const event = headers['x-wc-webhook-event'] || 'created';
  const topic = headers['x-wc-webhook-topic'] || 'action.woocommerce_created';
  return {
    verified: true,
    eventType: `${topic}.${event}`,
    externalEventId: headers['x-wc-webhook-id'] || `wc-evt-${Date.now()}`,
    payload,
  };
};
