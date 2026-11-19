import mongoose from 'mongoose';

const syncHistorySchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'ChannelConnection',
      required: true,
    },
    provider: {
      type: String,
      default: 'AMAZON',
      required: true,
    },
    syncType: {
      type: String,
      enum: ['PRODUCT', 'INVENTORY', 'ORDER', 'WEBHOOK', 'FULL', 'MANUAL', 'AMAZON_CATALOG', 'AMAZON_LISTINGS'],
      default: 'MANUAL',
    },
    direction: {
      type: String,
      enum: ['IMPORT', 'EXPORT', 'BIDIRECTIONAL'],
      default: 'IMPORT',
    },
    status: {
      type: String,
      enum: ['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'],
      default: 'RUNNING',
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    recordsProcessed: { type: Number, default: 0 },
    recordsSucceeded: { type: Number, default: 0 },
    recordsFailed: { type: Number, default: 0 },
    totalFetched: { type: Number, default: 0 },
    totalCreated: { type: Number, default: 0 },
    totalUpdated: { type: Number, default: 0 },
    totalSkipped: { type: Number, default: 0 },
    error: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

syncHistorySchema.index({ sellerId: 1, provider: 1, createdAt: -1 });

export const SyncHistory = mongoose.models.SyncHistory || mongoose.model('SyncHistory', syncHistorySchema);
export default SyncHistory;
