export const validateNotificationInput = (data) => {
  const errors = [];
  if (!data.type) errors.push('Notification type is required');
  if (!data.title) errors.push('Notification title is required');
  if (!data.message) errors.push('Notification message is required');

  return {
    isValid: errors.length === 0,
    errors,
  };
};
