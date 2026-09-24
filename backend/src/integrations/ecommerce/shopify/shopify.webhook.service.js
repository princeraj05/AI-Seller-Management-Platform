export const handleShopifyWebhookNotification = async (headers, payload) => {
  const topic = headers['x-shopify-topic'] || 'orders/create';
  return {
    verified: true,
    eventType: topic,
    externalEventId: headers['x-shopify-webhook-id'] || `shp-evt-${Date.now()}`,
    payload,
  };
};
