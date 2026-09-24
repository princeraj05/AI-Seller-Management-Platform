import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    variantId: { type: mongoose.Schema.Types.ObjectId },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, default: 'Customer Return' },
    condition: {
      type: String,
      enum: ['NEW', 'OPEN_BOX', 'DAMAGED', 'DEFECTIVE'],
      default: 'NEW',
    },
    inspectionStatus: {
      type: String,
      enum: ['PENDING', 'INSPECTED', 'REJECTED'],
      default: 'PENDING',
    },
    disposition: {
      type: String,
      enum: ['RESTOCK', 'DAMAGED', 'DISPOSED', 'PENDING_INSPECTION'],
      default: 'PENDING_INSPECTION',
    },
    restockedQuantity: { type: Number, default: 0 },
  },
  { _id: true }
);

const returnSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    rmaNumber: {
      type: String,
      required: true,
      unique: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    externalOrderId: {
      type: String,
    },
    channel: {
      type: String,
      enum: ['AMAZON', 'FLIPKART', 'MYNTRA', 'SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE', 'POS'],
      required: true,
    },
    items: [returnItemSchema],
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'INSPECTED', 'COMPLETED', 'CANCELLED'],
      default: 'REQUESTED',
    },
    refundStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'PENDING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
    },
    refundAmount: {
      type: Number,
      default: 0,
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
