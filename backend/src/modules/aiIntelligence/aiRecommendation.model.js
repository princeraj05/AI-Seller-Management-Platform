import mongoose from 'mongoose';

const aiRecommendationSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: { type: String, required: true },
    title: { type: String, required: true },
    reason: { type: String, required: true },
    evidence: { type: String, required: true },
    suggestedAction: { type: String, required: true },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    executed: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const AiRecommendation =
  mongoose.models.AiRecommendation || mongoose.model('AiRecommendation', aiRecommendationSchema);
export default AiRecommendation;
