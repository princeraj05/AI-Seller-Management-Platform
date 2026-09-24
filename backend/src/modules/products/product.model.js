import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
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
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    shortDescription: {
      type: String,
      default: '',
    },
    brand: {
      type: String,
      default: 'Bhartiye Crafts',
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    categoryName: {
      type: String,
      default: 'Fashion',
    },
    material: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '',
    },
    images: {
      type: [String],
      default: [],
    },
    costPrice: {
      type: Number,
      default: 0,
    },
    masterPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    channels: {
      type: [String],
      default: ['amazon', 'flipkart', 'myntra', 'website', 'pos'],
    },
    channelPrices: {
      type: Map,
      of: Number,
      default: {},
    },
    attributes: {
      type: Map,
      of: String,
      default: {},
    },
    seo: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      keywords: { type: [String], default: [] },
    },
    keywords: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['Active', 'Low Stock', 'Out of Stock', 'Draft', 'Archived'],
      default: 'Active',
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    aiApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// SKU uniqueness must be tenant-aware (compound index sellerId + sku)
productSchema.index({ sellerId: 1, sku: 1 }, { unique: true });

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
