import mongoose from 'mongoose';

const trendSignalSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: {
      type: String,
      default: 'Derived from seller catalog and sales data',
    },
    trendType: {
      type: String,
      enum: ['MARKET', 'PRODUCT', 'FASHION', 'COLOR', 'CATEGORY', 'KEYWORD'],
      required: true,
    },
    name: { type: String, required: true },
    category: { type: String, default: 'General' },
    subcategory: { type: String, default: '' },
    keywords: [{ type: String }],
    colors: [{ type: String }],
    score: { type: Number, default: 85 },
    confidence: { type: Number, default: 0.9 },
    evidence: { type: String, required: true },
    observedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

trendSignalSchema.index({ sellerId: 1, trendType: 1 });

export const TrendSignal = mongoose.models.TrendSignal || mongoose.model('TrendSignal', trendSignalSchema);
export default TrendSignal;
