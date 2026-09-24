import {
  getNotificationsService,
  markNotificationAsReadService,
  markAllNotificationsAsReadService,
} from './notification.service.js';
import {
  getNotificationPreferencesService,
  updateNotificationPreferencesService,
} from './notificationPreference.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const getNotifications = async (req, res) => {
  try {
    const data = await getNotificationsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Notifications fetched successfully', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch notifications');
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const updated = await markNotificationAsReadService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Notification marked as read', { notification: updated });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update notification');
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const data = await markAllNotificationsAsReadService(req.tenant.sellerId);
    return successResponse(res, 200, 'All notifications marked as read', data);
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to mark notifications as read');
  }
};

export const getNotificationPreferences = async (req, res) => {
  try {
    const prefs = await getNotificationPreferencesService(req.tenant.sellerId);
    return successResponse(res, 200, 'Notification preferences fetched successfully', { preferences: prefs });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch notification preferences');
  }
};

export const updateNotificationPreferences = async (req, res) => {
  try {
    const prefs = await updateNotificationPreferencesService(req.tenant.sellerId, req.body);
    return successResponse(res, 200, 'Notification preferences updated successfully', { preferences: prefs });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update notification preferences');
  }
};
