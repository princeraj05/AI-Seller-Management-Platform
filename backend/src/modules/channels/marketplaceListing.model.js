import mongoose from 'mongoose';

const marketplaceListingSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'Product',
      default: null,
      index: true,
    },
    variantId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    channelId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'ChannelConnection',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: 'AMAZON',
      required: true,
    },
    marketplaceId: {
      type: String,
      default: 'A21TJRUUN4KGV',
      index: true,
    },
    externalProductId: {
      type: String,
      required: true, // ASIN for Amazon
      index: true,
    },
    asin: {
      type: String,
      default: '',
      index: true,
    },
    externalVariantId: {
      type: String,
      default: '',
    },
    externalSku: {
      type: String,
      required: true, // SKU for Amazon
      index: true,
    },
    title: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    quantity: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'PUBLISHED', 'ACTIVE', 'INACTIVE', 'FAILED', 'UNPUBLISHED'],
      default: 'PENDING',
    },
    issues: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    publishedAt: { type: Date, default: Date.now },
    lastSyncedAt: { type: Date, default: Date.now },
    lastError: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Prevent duplicate SKU records per seller and channel connection
marketplaceListingSchema.index({ sellerId: 1, channelId: 1, externalSku: 1 }, { unique: true });
marketplaceListingSchema.index({ sellerId: 1, channelId: 1, externalProductId: 1 });
marketplaceListingSchema.index({ sellerId: 1, provider: 1, asin: 1 });

export const MarketplaceListing =
  mongoose.models.MarketplaceListing || mongoose.model('MarketplaceListing', marketplaceListingSchema);
export default MarketplaceListing;
