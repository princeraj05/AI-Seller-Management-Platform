import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['FREE', 'BASIC', 'PRO', 'PREMIUM'],
      default: 'FREE',
    },
    status: {
      type: String,
      enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED', 'INACTIVE'],
      default: 'ACTIVE',
    },
    provider: {
      type: String,
      enum: ['RAZORPAY', 'STRIPE', 'MANUAL'],
      default: 'RAZORPAY',
    },
    externalCustomerId: { type: String, default: '' },
    externalSubscriptionId: { type: String, default: '' },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Subscription =
  mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
