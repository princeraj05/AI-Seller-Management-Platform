import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index: auto-deletes expired documents
    },
  },
  {
    timestamps: true,
  }
);

refreshTokenSchema.index({ userId: 1, family: 1 });

export const RefreshToken =
  mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema);
