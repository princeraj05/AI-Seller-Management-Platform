import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    asin: { type: String, default: '' },
    title: { type: String, default: '' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    variantId: { type: mongoose.Schema.Types.ObjectId },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, default: 'Customer Return' },
    condition: {
      type: String,
      default: 'NEW',
    },
    inspectionStatus: {
      type: String,
      enum: ['PENDING', 'INSPECTED', 'REJECTED'],
      default: 'PENDING',
    },
    disposition: {
      type: String,
      default: 'PENDING_INSPECTION',
    },
    restockedQuantity: { type: Number, default: 0 },
  },
  { _id: true }
);

const returnSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true,
    },
    channelId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true,
    },
    marketplaceId: {
      type: String,
      default: 'A21TJRUUN4KGV',
    },
    rmaNumber: {
      type: String,
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'Order',
    },
    externalOrderId: {
      type: String,
      index: true,
    },
    channel: {
      type: String,
      enum: ['AMAZON', 'FLIPKART', 'MYNTRA', 'SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE', 'POS', 'Amazon', 'Flipkart', 'Myntra'],
      required: true,
    },
    items: [returnItemSchema],
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'INSPECTED', 'COMPLETED', 'CANCELLED', 'RETURNED', 'REFUNDED'],
      default: 'REQUESTED',
    },
    refundStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING', 'PROCESSED', 'FAILED', 'REFUNDED', 'PARTIAL', 'FULL'],
      default: 'PENDING',
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundDate: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      default: 'AMAZON',
    },
    sourceMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    customerNote: {
      type: String,
    },
    adminNote: {
      type: String,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

returnSchema.index({ sellerId: 1, rmaNumber: 1 }, { unique: true });
returnSchema.index({ sellerId: 1, orderId: 1 });
returnSchema.index({ sellerId: 1, status: 1 });

export const Return = mongoose.models.Return || mongoose.model('Return', returnSchema);
export default Return;
