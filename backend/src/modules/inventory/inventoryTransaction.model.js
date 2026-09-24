import mongoose from 'mongoose';

const inventoryTransactionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: String,
      required: true,
      index: true,
    },
    storeId: {
      type: String,
      default: null,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductVariant',
      default: null,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: [
        'PURCHASE',
        'SALE',
        'RETURN',
        'ADJUSTMENT',
        'RESERVATION',
        'RELEASE',
        'SYNC',
        'INITIAL_STOCK',
        'DAMAGE',
        'LOSS',
      ],
      required: true,
    },
    channel: {
      type: String,
      enum: ['AMAZON', 'FLIPKART', 'MYNTRA', 'OWN_WEBSITE', 'OFFLINE', 'POS', 'MANUAL'],
      default: 'POS',
    },
    quantityChange: {
      type: Number,
      required: true,
    },
    previousStock: {
      type: Number,
      required: true,
    },
    newStock: {
      type: Number,
      required: true,
    },
    referenceType: {
      type: String,
      enum: ['POS_BILL', 'ORDER', 'MANUAL_ADJUSTMENT', 'RESERVATION'],
      default: 'POS_BILL',
    },
    referenceId: {
      type: String,
      default: '',
    },
    reason: {
      type: String,
      default: '',
    },
    performedBy: {
      type: String,
      default: 'System',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

inventoryTransactionSchema.index({ sellerId: 1, createdAt: -1 });

export const InventoryTransaction =
  mongoose.models.InventoryTransaction || mongoose.model('InventoryTransaction', inventoryTransactionSchema);
