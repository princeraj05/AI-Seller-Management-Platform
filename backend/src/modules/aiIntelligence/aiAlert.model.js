import mongoose from 'mongoose';

const aiAlertSchema = new mongoose.Schema(
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
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'HIGH_RETURN_RATE',
        'SALES_DROP',
        'SALES_SPIKE',
        'ORDER_ANOMALY',
        'SYNC_FAILURE',
        'CHANNEL_ERROR',
        'PRODUCT_OPPORTUNITY',
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      default: 'WARNING',
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    referenceId: { type: String, default: '' },
    deduplicationKey: { type: String, required: true, unique: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

aiAlertSchema.index({ sellerId: 1, read: 1 });

export const AiAlert = mongoose.models.AiAlert || mongoose.model('AiAlert', aiAlertSchema);
export default AiAlert;
