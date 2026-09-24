import mongoose from 'mongoose';

const aiInsightSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    confidence: { type: Number, default: 0.9 },
    evidence: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const AiInsight = mongoose.models.AiInsight || mongoose.model('AiInsight', aiInsightSchema);
export default AiInsight;
