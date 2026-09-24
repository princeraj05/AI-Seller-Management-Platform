import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
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
    uppercase: true,
  },
  title: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
  },
  tax: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  },
});

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  previousStatus: { type: String, default: '' },
  changedBy: { type: String, default: 'System' },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema(
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
    orderNumber: {
      type: String,
      required: true,
    },
    externalOrderId: {
      type: String,
      default: '',
    },
    channel: {
      type: String,
      enum: ['AMAZON', 'FLIPKART', 'MYNTRA', 'OWN_WEBSITE', 'POS', 'OFFLINE', 'Amazon', 'Flipkart', 'Myntra', 'Website', 'Offline'],
      default: 'AMAZON',
    },
    customer: {
      customerId: { type: String, default: '' },
      name: { type: String, required: true },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    shippingAddress: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    billingAddress: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      city: { type: String, default: '' },
      postalCode: { type: String, default: '' },
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    shippingFee: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    gst: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    payment: {
      method: { type: String, default: 'UPI' },
      status: { type: String, default: 'PAID' },
      transactionId: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONFIRMED',
        'PROCESSING',
        'PACKED',
        'SHIPPED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'FAILED',
        'RETURN_REQUESTED',
        'RETURNED',
        'REFUNDED',
        'Shipped',
        'Delivered',
        'Processing',
        'Completed',
      ],
      default: 'PENDING',
    },
    fulfillmentStatus: {
      type: String,
      default: 'UNFULFILLED',
    },
    returnStatus: {
      type: String,
      default: 'NONE',
    },
    statusHistory: [statusHistorySchema],
    inventoryDeducted: {
      type: Boolean,
      default: false,
    },
    sourceMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    placedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ sellerId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ sellerId: 1, channel: 1, externalOrderId: 1 }, { unique: true, sparse: true });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
