import mongoose from 'mongoose';
import { Notification } from './notification.model.js';

export const inMemoryNotificationsMap = new Map();

export const createNotificationService = async (sellerId, notificationData) => {
  const { type, title, message, referenceId = '' } = notificationData;
  const dedupKey = `${sellerId}_${type}_${referenceId || title}`;

  // 1. Check Deduplication
  try {
    const existing = await Notification.findOne({ deduplicationKey: dedupKey });
    if (existing) return existing;
  } catch (err) {
    if (inMemoryNotificationsMap.has(dedupKey)) {
      return inMemoryNotificationsMap.get(dedupKey);
    }
  }

  const payload = {
    sellerId,
    type,
    title,
    message,
    referenceId,
    deduplicationKey: dedupKey,
    read: false,
  };

  let doc = null;
  try {
    doc = await Notification.create(payload);
  } catch (err) {
    const id = new mongoose.Types.ObjectId().toString();
    doc = { _id: id, ...payload, createdAt: new Date() };
    inMemoryNotificationsMap.set(dedupKey, doc);
  }

  return doc;
};

export const getNotificationsService = async (sellerId, query = {}) => {
  let list = [];
  try {
    list = await Notification.find({ sellerId }).sort({ createdAt: -1 });
  } catch (err) {
    list = Array.from(inMemoryNotificationsMap.values()).filter(
      (n) => n.sellerId.toString() === sellerId.toString()
    );
  }

  const unreadCount = list.filter((n) => !n.read).length;

  return { notifications: list, unreadCount };
};

export const markNotificationAsReadService = async (sellerId, notificationId) => {
  let doc = null;
  try {
    doc = await Notification.findOneAndUpdate({ sellerId, _id: notificationId }, { $set: { read: true } }, { new: true });
  } catch (err) {
    console.warn('DB mark notification read failed:', err.message);
  }

  if (!doc) {
    for (const [key, n] of inMemoryNotificationsMap.entries()) {
      if (n._id === notificationId && n.sellerId.toString() === sellerId.toString()) {
        n.read = true;
        inMemoryNotificationsMap.set(key, n);
        return n;
      }
    }
  }

  return doc;
};

export const markAllNotificationsAsReadService = async (sellerId) => {
  try {
    await Notification.updateMany({ sellerId, read: false }, { $set: { read: true } });
  } catch (err) {
    for (const [key, n] of inMemoryNotificationsMap.entries()) {
      if (n.sellerId.toString() === sellerId.toString()) {
        n.read = true;
        inMemoryNotificationsMap.set(key, n);
      }
    }
  }

  return getNotificationsService(sellerId);
};
