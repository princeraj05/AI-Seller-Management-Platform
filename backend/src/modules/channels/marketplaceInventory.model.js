import mongoose from 'mongoose';

const marketplaceInventorySchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    asin: {
      type: String,
      default: '',
      index: true,
    },
    fnSku: {
      type: String,
      default: '',
    },
    productName: {
      type: String,
      default: '',
    },
    condition: {
      type: String,
      default: 'NewItem',
    },
    fulfillmentChannel: {
      type: String,
      enum: ['FBA', 'FBM', 'HYBRID', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    // FBA inventory breakdown from getInventorySummaries
    fulfillableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    inboundWorkingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    inboundShippedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    inboundReceivingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    inboundQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    unfulfillableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    researchingQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Merchant-fulfilled stock from Listings Items fulfillmentAvailability
    sellerFulfilledQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    source: {
      type: String,
      enum: ['AMAZON_FBA_API', 'AMAZON_LISTINGS_API', 'HYBRID'],
      default: 'AMAZON_FBA_API',
    },
    syncStatus: {
      type: String,
      enum: ['SYNCED', 'PENDING', 'ERROR'],
      default: 'SYNCED',
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    lastUpdatedTime: {
      type: Date,
      default: null,
    },
    rawDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Prevent duplicate inventory records per seller, channel connection, and SKU
marketplaceInventorySchema.index({ sellerId: 1, channelId: 1, externalSku: 1 }, { unique: true });
marketplaceInventorySchema.index({ sellerId: 1, marketplaceId: 1, asin: 1 });

export const MarketplaceInventory =
  mongoose.models.MarketplaceInventory || mongoose.model('MarketplaceInventory', marketplaceInventorySchema);
export default MarketplaceInventory;
