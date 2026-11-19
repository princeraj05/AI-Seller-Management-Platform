import express from 'express';
import {
  connectChannel,
  getChannels,
  getChannelById,
  disconnectChannel,
  testChannelConnection,
  syncChannel,
  publishProductToChannel,
  getChannelHealth,
  initiateAmazonOAuth,
  handleAmazonOAuthCallback,
  connectAmazonManual,
  getAmazonConnectionStatus,
  disconnectAmazon,
  testAmazonConnection,
  searchAmazonCatalog,
  getAmazonCatalogItemByAsin,
  getAmazonListings,
  getAmazonListingBySku,
  triggerAmazonSync,
  getAmazonSyncStatus,
  getAmazonInventory,
  getAmazonInventoryBySku,
  triggerAmazonInventorySync,
  getAmazonInventoryStatus,
  getAmazonPricing,
  getAmazonPricingBySku,
  triggerAmazonPricingSync,
  getAmazonPricingStatus,
  getAmazonOrders,
  getAmazonOrderById,
  triggerAmazonOrdersSync,
  getAmazonOrdersStatus,
  getAmazonOrderDetails,
  getAmazonOrderItems,
  syncSingleAmazonOrder,
  getAmazonReturns,
  getAmazonReturnById,
  getAmazonOrderRefunds,
  triggerAmazonReturnsSync,
  getAmazonReturnsStatus,
  getEligibleCatalogueProducts,
  getAmazonProductTypes,
  getAmazonProductTypeSchema,
  validateAmazonListing,
  createOrUpdateAmazonListingSubmission,
  submitAmazonListing,
  getAmazonListingSubmissions,
  getAmazonListingSubmissionById,
} from './channel.controller.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { tenantMiddleware } from '../../middleware/tenantMiddleware.js';
import { authorizeRoles } from '../../middleware/rbacMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(authorizeRoles('seller', 'admin'));

// Dedicated Amazon SP-API Integration Endpoints (declared before /:id)
router.get('/amazon/status', getAmazonConnectionStatus);
router.get('/amazon/oauth/initiate', initiateAmazonOAuth);
router.get('/amazon/oauth/callback', handleAmazonOAuthCallback);
router.post('/amazon/oauth/callback', handleAmazonOAuthCallback);
router.post('/amazon/connect-manual', connectAmazonManual);
router.post('/amazon/disconnect', disconnectAmazon);
router.post('/amazon/test', testAmazonConnection);

// Task 9: Amazon Product Listing & Publishing Workflow (Sandbox Only - declared before /amazon/listings/:sku)
router.get('/amazon/products/eligible', getEligibleCatalogueProducts);
router.get('/amazon/definitions/product-types', getAmazonProductTypes);
router.get('/amazon/definitions/product-types/:productType', getAmazonProductTypeSchema);
router.post('/amazon/listings/submissions/validate', validateAmazonListing);
router.post('/amazon/listings/submissions', createOrUpdateAmazonListingSubmission);
router.post('/amazon/listings/submissions/:id/submit', submitAmazonListing);
router.get('/amazon/listings/submissions', getAmazonListingSubmissions);
router.get('/amazon/listings/submissions/:id', getAmazonListingSubmissionById);

// Amazon Catalog & Listings Read-Only Synchronization Endpoints
router.get('/amazon/catalog/search', searchAmazonCatalog);
router.get('/amazon/catalog/:asin', getAmazonCatalogItemByAsin);
router.get('/amazon/listings', getAmazonListings);
router.get('/amazon/listings/:sku', getAmazonListingBySku);
router.post('/amazon/sync', triggerAmazonSync);
router.get('/amazon/sync/status', getAmazonSyncStatus);

// Task 5: Amazon Inventory & Pricing Read-Only Sync Endpoints
router.get('/amazon/inventory', getAmazonInventory);
router.get('/amazon/inventory/status', getAmazonInventoryStatus);
router.get('/amazon/inventory/:sku', getAmazonInventoryBySku);
router.post('/amazon/inventory/sync', triggerAmazonInventorySync);

router.get('/amazon/pricing', getAmazonPricing);
router.get('/amazon/pricing/status', getAmazonPricingStatus);
router.get('/amazon/pricing/:sku', getAmazonPricingBySku);
router.post('/amazon/pricing/sync', triggerAmazonPricingSync);

// Task 6: Amazon Orders Read-Only Sync Endpoints
router.get('/amazon/orders', getAmazonOrders);
router.get('/amazon/orders/status', getAmazonOrdersStatus);
router.get('/amazon/orders/:orderId', getAmazonOrderById);
router.post('/amazon/orders/sync', triggerAmazonOrdersSync);

// Task 7: Amazon Order Details & Single Order Sync
router.get('/amazon/orders/:orderId/details', getAmazonOrderDetails);
router.get('/amazon/orders/:orderId/items', getAmazonOrderItems);
router.post('/amazon/orders/:orderId/sync', syncSingleAmazonOrder);
router.get('/amazon/orders/:orderId/refunds', getAmazonOrderRefunds);

// Task 7: Amazon Returns & Refunds Visibility Endpoints
router.get('/amazon/returns', getAmazonReturns);
router.get('/amazon/returns/status', getAmazonReturnsStatus);
router.get('/amazon/returns/:returnId', getAmazonReturnById);
router.post('/amazon/returns/sync', triggerAmazonReturnsSync);

router.get('/health', getChannelHealth);
router.get('/', getChannels);
router.post('/connect', connectChannel);
router.post('/:provider/connect', connectChannel);
router.get('/:id', getChannelById);
router.post('/:id/disconnect', disconnectChannel);
router.post('/:id/test', testChannelConnection);
router.post('/:id/sync', syncChannel);
router.post('/publish/:productId/:channelId', publishProductToChannel);

export default router;
