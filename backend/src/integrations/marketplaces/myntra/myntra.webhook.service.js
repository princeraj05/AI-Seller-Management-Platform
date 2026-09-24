export const handleMyntraWebhookNotification = async (headers, payload) => {
  return {
    verified: true,
    eventType: payload?.event || 'ORDER_PLACED',
    externalEventId: payload?.id || `myn-evt-${Date.now()}`,
    payload,
  };
};
