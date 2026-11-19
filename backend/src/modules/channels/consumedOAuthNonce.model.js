import mongoose from 'mongoose';

const consumedOAuthNonceSchema = new mongoose.Schema(
  {
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: 'AMAZON',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Automatic MongoDB TTL cleanup upon expiration
    },
  },
  { timestamps: true }
);

export const ConsumedOAuthNonce =
  mongoose.models.ConsumedOAuthNonce || mongoose.model('ConsumedOAuthNonce', consumedOAuthNonceSchema);
export default ConsumedOAuthNonce;
