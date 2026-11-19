import mongoose from 'mongoose';

const distributedSyncLockSchema = new mongoose.Schema(
  {
    lockKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sellerId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    resource: {
      type: String,
      default: 'AMAZON_ORDER_SYNC',
    },
    lockId: {
      type: String,
      required: true,
    },
    acquiredAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Automatic TTL cleanup by MongoDB
    },
  },
  { timestamps: true }
);

export const DistributedSyncLock =
  mongoose.models.DistributedSyncLock || mongoose.model('DistributedSyncLock', distributedSyncLockSchema);

export default DistributedSyncLock;
