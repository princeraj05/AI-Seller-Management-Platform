import mongoose from 'mongoose';

const marketplacePricingSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'ChannelConnection',
      required: true,
      index: true,
    },
    marketplaceId: {
      type: String,
      default: 'A21TJRUUN4KGV',
      index: true,
    },
    externalSku: {
      type: String,
      default: '',
      index: true,
    },
    asin: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: '',
    },
    // The seller's own listing offer price (distinct from competitors)
    ownListingPrice: {
      type: Number,
      default: null,
    },
    shippingPrice: {
      type: Number,
      default: 0,
    },
    landedPrice: {
      type: Number,
      default: null,
    },
    // Market and competitor pricing metrics
    buyBoxPrice: {
      type: Number,
      default: null,
    },
    isBuyBoxWinner: {
      type: Boolean,
      default: false,
    },
    lowestOfferPrice: {
      type: Number,
      default: null,
    },
    competitivePrice: {
      type: Number,
      default: null,
    },
    totalOfferCount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    fulfillmentChannel: {
      type: String,
      default: 'Amazon',
    },
    condition: {
      type: String,
      default: 'New',
    },
    observedAt: {
      type: Date,
      default: Date.now,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    syncStatus: {
      type: String,
      enum: ['SYNCED', 'PENDING', 'ERROR'],
      default: 'SYNCED',
    },
    rawSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Prevent duplicate pricing records per seller, channel connection, and SKU
marketplacePricingSchema.index({ sellerId: 1, channelId: 1, externalSku: 1 }, { unique: true });
marketplacePricingSchema.index({ sellerId: 1, channelId: 1, asin: 1 });

export const MarketplacePricing =
  mongoose.models.MarketplacePricing || mongoose.model('MarketplacePricing', marketplacePricingSchema);
export default MarketplacePricing;
