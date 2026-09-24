export const handleCustomWebhookNotification = async (headers, payload) => {
  return {
    verified: true,
    eventType: payload?.event || 'order.created',
    externalEventId: payload?.event_id || `cust-evt-${Date.now()}`,
    payload,
  };
};
