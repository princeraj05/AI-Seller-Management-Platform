import mongoose from 'mongoose';

const channelConnectionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      index: true,
    },
    channel: {
      type: String,
      default: 'amazon',
      index: true,
    },
    provider: {
      type: String,
      enum: ['AMAZON', 'FLIPKART', 'MYNTRA', 'SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE', 'POS'],
      required: true,
      index: true,
    },
    environment: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox',
    },
    type: {
      type: String,
      enum: ['MARKETPLACE', 'ECOMMERCE', 'POS'],
      required: true,
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONNECTED',
        'SANDBOX_TRANSPORT_VERIFIED',
        'SYNCING',
        'ERROR',
        'DISCONNECTED',
        'REAUTH_REQUIRED',
      ],
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
    marketplaceId: {
      type: String,
      default: null,
      index: true,
    },
    sellingPartnerId: {
      type: String,
      default: null,
      index: true,
    },
    marketplaceRegion: {
      type: String,
      enum: ['eu', 'na', 'fe'],
      default: 'eu',
    },
    authorizedAt: {
      type: Date,
      default: null,
    },
    tokenUpdatedAt: {
      type: Date,
      default: null,
    },
    lwaVerified: {
      type: Boolean,
      default: false,
    },
    sandboxTransportVerified: {
      type: Boolean,
      default: false,
    },
    sellerAuthorizationVerified: {
      type: Boolean,
      default: false,
    },
    indiaMarketplaceAuthorized: {
      type: Boolean,
      default: false,
    },
    verificationMode: {
      type: String,
      enum: ['REAL_SELLER_AUTHORIZED', 'SANDBOX_STATIC_MOCK', 'UNKNOWN', 'FAILED', null],
      default: null,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
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
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.credentials;
        return ret;
      },
    },
    toObject: {
      transform: (doc, ret) => {
        delete ret.credentials;
        return ret;
      },
    },
  }
);

channelConnectionSchema.index({ sellerId: 1, provider: 1, marketplaceId: 1 });
channelConnectionSchema.index({ sellerId: 1, provider: 1, displayName: 1 });

export const ChannelConnection =
  mongoose.models.ChannelConnection || mongoose.model('ChannelConnection', channelConnectionSchema);
export default ChannelConnection;
