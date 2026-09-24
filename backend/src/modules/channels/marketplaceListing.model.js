import mongoose from 'mongoose';

const marketplaceListingSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChannelConnection',
      required: true,
    },
    provider: {
      type: String,
      required: true,
    },
    externalProductId: {
      type: String,
      required: true,
    },
    externalVariantId: {
      type: String,
      default: '',
    },
    externalSku: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'PUBLISHED', 'FAILED', 'UNPUBLISHED'],
      default: 'PENDING',
    },
    publishedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, default: Date.now },
    lastError: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

marketplaceListingSchema.index({ sellerId: 1, productId: 1, channelId: 1 }, { unique: true });

export const MarketplaceListing =
  mongoose.models.MarketplaceListing || mongoose.model('MarketplaceListing', marketplaceListingSchema);
export default MarketplaceListing;
