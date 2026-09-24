import mongoose from 'mongoose';

const channelConnectionSchema = new mongoose.Schema(
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
    provider: {
      type: String,
      enum: ['AMAZON', 'FLIPKART', 'MYNTRA', 'SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE', 'POS'],
      required: true,
    },
    type: {
      type: String,
      enum: ['MARKETPLACE', 'ECOMMERCE', 'POS'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'CONNECTED', 'SYNCING', 'ERROR', 'DISCONNECTED', 'REAUTH_REQUIRED'],
      default: 'PENDING',
    },
    displayName: {
      type: String,
      required: true,
    },
    externalAccountId: {
      type: String,
      default: '',
    },
    externalStoreId: {
      type: String,
      default: '',
    },
    credentials: {
      iv: { type: String },
      content: { type: String },
      tag: { type: String },
    },
    scopes: [{ type: String }],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastSyncAt: { type: Date, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

channelConnectionSchema.index({ sellerId: 1, provider: 1, displayName: 1 }, { unique: true });

export const ChannelConnection =
  mongoose.models.ChannelConnection || mongoose.model('ChannelConnection', channelConnectionSchema);
export default ChannelConnection;
