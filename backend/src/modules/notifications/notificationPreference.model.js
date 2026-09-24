import mongoose from 'mongoose';

const notificationPreferenceSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    emailAlerts: { type: Boolean, default: true },
    inAppAlerts: { type: Boolean, default: true },
    orderNotifications: { type: Boolean, default: true },
    inventoryNotifications: { type: Boolean, default: true },
    channelNotifications: { type: Boolean, default: true },
    securityNotifications: { type: Boolean, default: true },
    billingNotifications: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const NotificationPreference =
  mongoose.models.NotificationPreference ||
  mongoose.model('NotificationPreference', notificationPreferenceSchema);
export default NotificationPreference;
