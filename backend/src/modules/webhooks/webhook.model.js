import mongoose from 'mongoose';

const webhookLogSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelConnection',
    },
    eventType: {
      type: String,
      required: true,
    },
    externalEventId: {
      type: String,
      required: true,
    },
    payloadHash: {
      type: String,
      required: true,
      unique: true,
    },
    processed: {
      type: Boolean,
      default: false,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

webhookLogSchema.index({ provider: 1, externalEventId: 1 });

export const WebhookLog = mongoose.models.WebhookLog || mongoose.model('WebhookLog', webhookLogSchema);
export default WebhookLog;
