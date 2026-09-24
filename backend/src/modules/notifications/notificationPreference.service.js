import mongoose from 'mongoose';
import { NotificationPreference } from './notificationPreference.model.js';

export const inMemoryNotificationPreferencesMap = new Map();

export const getNotificationPreferencesService = async (sellerId) => {
  let prefs = null;
  try {
    prefs = await NotificationPreference.findOne({ sellerId });
  } catch (err) {
    prefs = inMemoryNotificationPreferencesMap.get(sellerId.toString());
  }

  if (!prefs) {
    const defaultPrefs = {
      sellerId,
      emailAlerts: true,
      inAppAlerts: true,
      orderNotifications: true,
      inventoryNotifications: true,
      channelNotifications: true,
      securityNotifications: true,
      billingNotifications: true,
    };
    try {
      prefs = await NotificationPreference.create(defaultPrefs);
    } catch (createErr) {
      const id = new mongoose.Types.ObjectId().toString();
      prefs = { _id: id, ...defaultPrefs };
      inMemoryNotificationPreferencesMap.set(sellerId.toString(), prefs);
    }
  }

  return prefs;
};

export const updateNotificationPreferencesService = async (sellerId, updateData) => {
  delete updateData.sellerId;

  let prefs = null;
  try {
    prefs = await NotificationPreference.findOneAndUpdate(
      { sellerId },
      { $set: updateData },
      { new: true, upsert: true }
    );
  } catch (err) {
    const existing = inMemoryNotificationPreferencesMap.get(sellerId.toString()) || {};
    prefs = { ...existing, sellerId, ...updateData };
    inMemoryNotificationPreferencesMap.set(sellerId.toString(), prefs);
  }

  return prefs;
};
