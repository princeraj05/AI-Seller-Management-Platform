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
  orderItemId: {
    type: String,
    default: '',
  },
  asin: {
    type: String,
    default: '',
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
  shippedQuantity: {
    type: Number,
    default: 0,
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
  fulfillmentChannel: {
    type: String,
    default: '',
  },
  shippingPrice: {
    type: Number,
    default: 0,
  },
  promotionDiscount: {
    type: Number,
    default: 0,
  },
  cancelledQuantity: {
    type: Number,
    default: 0,
  },
  itemStatus: {
    type: String,
    default: '',
  },
  carrier: {
    type: String,
    default: '',
  },
  trackingNumber: {
    type: String,
    default: '',
  },
  shipDate: {
    type: Date,
    default: null,
  },
});

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  previousStatus: { type: String, default: '' },
  changedBy: { type: String, default: 'System' },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: '' },
  },
  { _id: false }
);

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
    channelId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'ChannelConnection',
      default: null,
      index: true,
    },
    provider: {
      type: String,
      default: 'AMAZON',
      index: true,
    },
    marketplaceId: {
      type: String,
      default: 'A21TJRUUN4KGV',
      index: true,
    },
    fulfillmentChannel: {
      type: String,
      enum: ['FBA', 'FBM', 'AFN', 'MFN', 'UNKNOWN', 'POS', 'SELF_FULFILLED'],
      default: 'UNKNOWN',
    },
    currency: {
      type: String,
      default: 'INR',
    },
    purchaseDate: {
      type: Date,
      default: null,
    },
    lastUpdateDate: {
      type: Date,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    customer: {
      customerId: { type: String, default: '' },
      name: { type: String, required: true },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    shippingAddress: {
      type: addressSchema,
      default: null,
    },
    billingAddress: {
      type: addressSchema,
      default: null,
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
        'UNKNOWN',
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
    originalAmazonStatus: {
      type: String,
      default: '',
    },
    fulfillmentStatus: {
      type: String,
      default: 'UNFULFILLED',
    },
    returnStatus: {
      type: String,
      default: 'NONE',
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundStatus: {
      type: String,
      default: 'NONE',
    },
    refundDate: {
      type: Date,
      default: null,
    },
    shipmentDetails: [
      {
        shipmentId: { type: String, default: '' },
        carrier: { type: String, default: '' },
        trackingNumber: { type: String, default: '' },
        shipDate: { type: Date, default: null },
        deliveryDate: { type: Date, default: null },
        shipmentStatus: { type: String, default: '' },
      },
    ],
    returnDetails: {
      isReturned: { type: Boolean, default: false },
      returnStatus: { type: String, default: 'NONE' },
      returnReason: { type: String, default: '' },
      returnDate: { type: Date, default: null },
      returnQuantity: { type: Number, default: 0 },
      condition: { type: String, default: '' },
      disposition: { type: String, default: '' },
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
orderSchema.index(
  { sellerId: 1, channel: 1, externalOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalOrderId: { $type: 'string', $gt: '' },
    },
  }
);

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
