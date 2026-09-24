import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sellerId: {
      type: String,
      required: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    categories: {
      type: [String],
      default: [],
    },
    selectedChannels: {
      type: [String],
      default: [],
    },
    onboardingCompleted: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'suspended'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

export const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);
