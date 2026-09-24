export const handleFlipkartWebhookNotification = async (headers, payload) => {
  return {
    verified: true,
    eventType: payload?.eventType || 'ORDER_CREATED',
    externalEventId: payload?.eventId || `fk-evt-${Date.now()}`,
    payload,
  };
};
