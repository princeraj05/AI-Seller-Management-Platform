import api from './api';

export const getNotificationsApi = async (params = {}) => {
  try {
    const response = await api.get('/notifications', { params });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch notifications');
    }
    throw new Error(error.message || 'Network error fetching notifications');
  }
};

export const markNotificationAsReadApi = async (notificationId) => {
  try {
    const response = await api.patch(`/notifications/${notificationId}/read`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to mark notification as read');
    }
    throw new Error(error.message || 'Network error updating notification');
  }
};

export const markAllNotificationsAsReadApi = async () => {
  try {
    const response = await api.patch('/notifications/read-all');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to mark all notifications as read');
    }
    throw new Error(error.message || 'Network error updating notifications');
  }
};

export const getNotificationPreferencesApi = async () => {
  try {
    const response = await api.get('/notifications/preferences');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch notification preferences');
    }
    throw new Error(error.message || 'Network error fetching preferences');
  }
};

export const updateNotificationPreferencesApi = async (preferencesData) => {
  try {
    const response = await api.patch('/notifications/preferences', preferencesData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to update notification preferences');
    }
    throw new Error(error.message || 'Network error updating preferences');
  }
};
