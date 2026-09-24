import mongoose from 'mongoose';

const productVariantSchema = new mongoose.Schema(
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
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    size: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      default: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    attributes: {
      type: Map,
      of: String,
      default: {},
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Out of Stock'],
      default: 'Active',
    },
  },
  {
    timestamps: true,
  }
);

productVariantSchema.index({ sellerId: 1, productId: 1 });
productVariantSchema.index({ sellerId: 1, sku: 1 }, { unique: true });

export const ProductVariant = mongoose.models.ProductVariant || mongoose.model('ProductVariant', productVariantSchema);
