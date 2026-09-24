import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'ORDER_RECEIVED',
        'ORDER_CANCELLED',
        'ORDER_DELIVERED',
        'RETURN_REQUESTED',
        'RETURN_RECEIVED',
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'SALES_SPIKE',
        'SALES_DROP',
        'SYNC_SUCCESS',
        'SYNC_FAILED',
        'CHANNEL_DISCONNECTED',
        'CHANNEL_REAUTH_REQUIRED',
        'AI_INSIGHT',
        'AI_RECOMMENDATION',
        'SYSTEM_ALERT',
        'BILLING',
        'SECURITY',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    referenceId: { type: String, default: '' },
    deduplicationKey: { type: String, required: true, unique: true },
    read: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ sellerId: 1, read: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
