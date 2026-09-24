import mongoose from 'mongoose';

const aiJobSchema = new mongoose.Schema(
  {
    sellerId: {
      type: String,
      required: true,
      index: true,
    },
    storeId: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ['product_generator', 'description_generator', 'attribute_extractor', 'seo_generator', 'chat_assistant'],
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'completed',
    },
    input: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    output: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const AIJob = mongoose.models.AIJob || mongoose.model('AIJob', aiJobSchema);
