import mongoose from 'mongoose';

const listingIssueSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    severity: { type: String, enum: ['ERROR', 'WARNING', 'INFO'], default: 'ERROR' },
    message: { type: String, required: true },
    attributeName: { type: String, default: null },
  },
  { _id: false }
);

const marketplaceListingSubmissionSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    channelConnectionId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'ChannelConnection',
      required: true,
    },
    provider: {
      type: String,
      default: 'AMAZON',
      uppercase: true,
    },
    marketplaceId: {
      type: String,
      default: 'A21TJRUUN4KGV',
      required: true,
      index: true,
    },
    environment: {
      type: String,
      enum: ['sandbox', 'production'],
      default: 'sandbox',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.Mixed,
      ref: 'Product',
      required: true,
      index: true,
    },
    sellerSku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    productType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    submissionMode: {
      type: String,
      enum: ['DRY_RUN', 'SANDBOX_SUBMISSION'],
      default: 'DRY_RUN',
    },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'VALIDATION_FAILED',
        'READY',
        'DRY_RUN',
        'DRY_RUN_COMPLETED',
        'SUBMITTED',
        'SANDBOX_SUBMITTED',
        'PROCESSING',
        'ACCEPTED',
        'REJECTED',
        'ERROR',
      ],
      default: 'DRAFT',
      index: true,
    },
    mappedAttributes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payloadPreview: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    amazonSubmissionId: {
      type: String,
      default: null,
      index: true,
    },
    issues: {
      type: [listingIssueSchema],
      default: [],
    },
    gtinExemptionRequested: {
      type: Boolean,
      default: false,
    },
    gtinExemptionReason: {
      type: String,
      default: '',
    },
    responseMetadata: {
      httpStatus: { type: Number, default: null },
      requestId: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      note: { type: String, default: '' },
    },
    lastSubmittedAt: {
      type: Date,
      default: null,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate listing submissions for the same seller, marketplace, SKU, and environment
marketplaceListingSubmissionSchema.index(
  { sellerId: 1, marketplaceId: 1, sellerSku: 1, environment: 1 },
  { unique: true }
);

export const MarketplaceListingSubmission =
  mongoose.models.MarketplaceListingSubmission ||
  mongoose.model('MarketplaceListingSubmission', marketplaceListingSubmissionSchema);

export const inMemorySubmissionsMap = new Map();

export default MarketplaceListingSubmission;
