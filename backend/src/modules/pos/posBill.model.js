import mongoose from 'mongoose';

const posItemSchema = new mongoose.Schema({
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
  name: {
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
  subtotal: {
    type: Number,
    required: true,
  },
  total: {
    type: Number,
    required: true,
  },
});

const posBillSchema = new mongoose.Schema(
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
    billNumber: {
      type: String,
      required: true,
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    customer: {
      customerId: { type: String, default: '' },
      name: { type: String, default: 'Walk-in Customer' },
      phone: { type: String, default: '' },
    },
    items: [posItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    discount: {
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
    grandTotal: {
      type: Number,
      required: true,
    },
    paymentMode: {
      type: String,
      enum: ['CASH', 'UPI', 'CARD', 'SPLIT', 'Cash', 'UPI', 'Card', 'Split'],
      default: 'UPI',
    },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING', 'REFUNDED'],
      default: 'PAID',
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'CANCELLED', 'REFUNDED'],
      default: 'COMPLETED',
    },
    notes: {
      type: String,
      default: '',
    },
    createdBy: {
      type: String,
      default: 'System',
    },
  },
  {
    timestamps: true,
  }
);

posBillSchema.index({ sellerId: 1, billNumber: 1 }, { unique: true });
posBillSchema.index({ sellerId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export const POSBill = mongoose.models.POSBill || mongoose.model('POSBill', posBillSchema);
