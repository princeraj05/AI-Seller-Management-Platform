export const handleWixWebhookNotification = async (headers, payload) => {
  return {
    verified: true,
    eventType: payload?.eventType || 'wix.stores.order_created',
    externalEventId: payload?.instanceId || `wix-evt-${Date.now()}`,
    payload,
  };
};
