export const handleAmazonWebhookNotification = async (headers, payload) => {
  const eventType = payload?.NotificationType || payload?.type || 'ORDER_CHANGE';
  return {
    verified: true,
    eventType,
    externalEventId: payload?.NotificationMetadata?.NotificationId || `amz-evt-${Date.now()}`,
    payload,
  };
};
