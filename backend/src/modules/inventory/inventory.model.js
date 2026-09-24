import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
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
      required: true,
      index: true,
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
    availableStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    reservedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    status: {
      type: String,
      enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'],
      default: 'IN_STOCK',
    },
  },
  {
    timestamps: true,
  }
);

inventorySchema.index({ sellerId: 1, sku: 1 }, { unique: true });

export const Inventory = mongoose.models.Inventory || mongoose.model('Inventory', inventorySchema);
