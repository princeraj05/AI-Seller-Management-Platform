import { validateConnectChannelInput } from './channel.validator.js';
import {
  connectChannelService,
  getChannelsService,
  getChannelByIdService,
  disconnectChannelService,
  testChannelConnectionService,
  syncChannelService,
  publishProductToChannelService,
  getAmazonOAuthUrlService,
  handleAmazonOAuthCallbackService,
  connectAmazonManualService,
  getAmazonConnectionStatusService,
  disconnectAmazonService,
  testAmazonConnectionService,
  buildTenantConnectionQuery,
  inMemoryChannelsMap,
  inMemoryListingsMap,
} from './channel.service.js';
import { ChannelConnection } from './channelConnection.model.js';
import { MarketplaceListing } from './marketplaceListing.model.js';
import { MarketplaceInventory } from './marketplaceInventory.model.js';
import { MarketplacePricing } from './marketplacePricing.model.js';
import { decryptCredentials } from '../../utils/encryption.js';
import { AmazonSpApiClient } from '../../integrations/marketplaces/amazon/amazon.client.js';
import {
  searchCatalogItems,
  getCatalogItem,
} from '../../integrations/marketplaces/amazon/amazon.catalog.service.js';
import {
  getListingsItem,
  searchListingsItems,
} from '../../integrations/marketplaces/amazon/amazon.listings.service.js';
import {
  syncAmazonSellerListingsService,
  getAmazonSyncStatusService,
} from '../../integrations/marketplaces/amazon/amazon.sync.service.js';
import {
  syncAmazonInventoryService,
  getAmazonInventoryStatusService,
  inMemoryInventoryMap,
} from '../../integrations/marketplaces/amazon/amazon.inventory.service.js';
import {
  syncAmazonPricingService,
  getAmazonPricingStatusService,
  inMemoryPricingMap,
} from '../../integrations/marketplaces/amazon/amazon.pricing.service.js';
import {
  syncAmazonOrdersService,
  getAmazonOrdersStatusService,
  getAmazonOrderDetailsService,
  getAmazonOrderItemsService,
  syncSingleAmazonOrderService,
  getAmazonReturnsService,
  getAmazonOrderRefundsService,
  syncAmazonReturnsService,
  getAmazonReturnsStatusService,
} from '../../integrations/marketplaces/amazon/amazon.order.service.js';
import { Return } from '../returns/return.model.js';
import { inMemoryReturnsMap } from '../returns/return.service.js';
import { Order } from '../orders/order.model.js';
import { inMemoryOrdersMap } from '../orders/order.service.js';
import { Product } from '../products/product.model.js';
import { MarketplaceListingSubmission } from './marketplaceListingSubmission.model.js';
import {
  searchProductTypes,
  getProductTypeDefinition,
} from '../../integrations/marketplaces/amazon/amazon.definitions.service.js';
import {
  validateListingData,
  buildSpApiListingPayload,
  executeListingSubmission,
  inMemorySubmissionsMap,
} from '../../integrations/marketplaces/amazon/amazon.publisher.service.js';
import { successResponse, errorResponse } from '../../utils/apiResponse.js';

export const connectChannel = async (req, res) => {
  try {
    const providerParam = req.params.provider ? req.params.provider.toUpperCase() : req.body.provider;
    const bodyWithProvider = { ...req.body, provider: providerParam };

    const { isValid, errors } = validateConnectChannelInput(bodyWithProvider);
    if (!isValid) {
      return errorResponse(res, 400, 'Channel connection validation failed', errors);
    }

    const channel = await connectChannelService(req.tenant, bodyWithProvider);
    return successResponse(res, 201, `Channel ${channel.displayName} connected successfully`, { channel });
  } catch (error) {
    console.error('Connect Channel Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to connect channel');
  }
};

export const getChannels = async (req, res) => {
  try {
    const channels = await getChannelsService(req.tenant.sellerId, req.query);
    return successResponse(res, 200, 'Channels fetched successfully', { channels });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch channels');
  }
};

export const getChannelById = async (req, res) => {
  try {
    const channel = await getChannelByIdService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Channel details fetched successfully', { channel });
  } catch (error) {
    return errorResponse(res, 404, error.message || 'Channel connection not found');
  }
};

export const disconnectChannel = async (req, res) => {
  try {
    const channel = await disconnectChannelService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Channel disconnected successfully', { channel });
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to disconnect channel');
  }
};

export const testChannelConnection = async (req, res) => {
  try {
    const result = await testChannelConnectionService(req.tenant.sellerId, req.params.id);
    return successResponse(res, 200, 'Channel connection test completed', result);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Connection test failed');
  }
};

export const syncChannel = async (req, res) => {
  try {
    const result = await syncChannelService(req.tenant, req.params.id, req.body.syncType);
    return successResponse(res, 200, 'Channel sync initiated successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to sync channel');
  }
};

export const publishProductToChannel = async (req, res) => {
  try {
    const { productId, channelId } = req.params;
    const result = await publishProductToChannelService(req.tenant, productId, channelId);
    return successResponse(res, 200, 'Product published to channel successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to publish product to channel');
  }
};

export const getChannelHealth = async (req, res) => {
  try {
    const channels = await getChannelsService(req.tenant.sellerId);
    const total = channels.length;
    const connected = channels.filter((c) => c.status === 'CONNECTED').length;
    const errorCount = channels.filter((c) => c.status === 'ERROR' || c.status === 'REAUTH_REQUIRED').length;

    return successResponse(res, 200, 'Channel health status fetched successfully', {
      totalChannels: total,
      connectedChannels: connected,
      errorChannels: errorCount,
      reauthRequiredChannels: channels.filter((c) => c.status === 'REAUTH_REQUIRED').length,
      channels,
    });
  } catch (error) {
    return errorResponse(res, 500, error.message || 'Failed to fetch channel health');
  }
};

/**
 * Initiate Amazon OAuth authorization
 */
export const initiateAmazonOAuth = async (req, res) => {
  try {
    const result = await getAmazonOAuthUrlService(req.tenant, req.query);
    return successResponse(res, 200, 'Amazon OAuth URL generated successfully', result);
  } catch (error) {
    console.error('Initiate Amazon OAuth Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to initiate Amazon OAuth');
  }
};

/**
 * Handle Amazon OAuth callback from Seller Central
 */
export const handleAmazonOAuthCallback = async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    const channel = await handleAmazonOAuthCallbackService(req.tenant, params);

    // If browser request, can redirect to frontend
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/channels/amazon?status=connected');
    }

    return successResponse(res, 200, 'Amazon account connected successfully via OAuth', { channel });
  } catch (error) {
    console.error('Amazon OAuth Callback Error:', error);
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect(`/channels/amazon?status=error&message=${encodeURIComponent(error.message)}`);
    }
    return errorResponse(res, 400, error.message || 'Amazon OAuth callback processing failed');
  }
};

/**
 * Connect Amazon via Sandbox Self-Authorization (LWA Refresh Token)
 */
export const connectAmazonManual = async (req, res) => {
  try {
    const { refreshToken, sellingPartnerId } = req.body;
    if (!refreshToken) {
      return errorResponse(res, 400, 'LWA Refresh Token is required');
    }

    const channel = await connectAmazonManualService(req.tenant, req.body);
    return successResponse(res, 201, 'Amazon account connected successfully via Sandbox Self-Authorization', {
      channel,
      connection: channel,
      data: { channel, connection: channel },
    });
  } catch (error) {
    console.error('Connect Amazon Manual Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to connect Amazon account');
  }
};

/**
 * Get Amazon connection status and details
 */
export const getAmazonConnectionStatus = async (req, res) => {
  try {
    const status = await getAmazonConnectionStatusService(req.tenant.sellerId);
    return successResponse(res, 200, 'Amazon connection status fetched successfully', {
      connection: status,
      data: { connection: status },
    });
  } catch (error) {
    console.error('Get Amazon Status Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to fetch Amazon connection status');
  }
};

/**
 * Disconnect Amazon integration
 */
export const disconnectAmazon = async (req, res) => {
  try {
    const channel = await disconnectAmazonService(req.tenant.sellerId);
    return successResponse(res, 200, 'Amazon channel disconnected successfully', { channel });
  } catch (error) {
    console.error('Disconnect Amazon Error:', error);
    return errorResponse(res, 400, error.message || 'Failed to disconnect Amazon');
  }
};

/**
 * Test Amazon connection live against SP-API LWA
 */
export const testAmazonConnection = async (req, res) => {
  try {
    const result = await testAmazonConnectionService(req.tenant.sellerId);
    return successResponse(res, 200, 'Amazon connection test completed', result);
  } catch (error) {
    console.error('Test Amazon Connection Error:', error);
    return errorResponse(res, 400, error.message || 'Amazon connection test failed');
  }
};

/**
 * Helper to obtain an authenticated AmazonSpApiClient for a verified tenant
 */
const getAmazonClientForTenant = async (sellerId) => {
  let connection = null;
  try {
    const query = buildTenantConnectionQuery(sellerId, 'AMAZON');
    connection = await ChannelConnection.findOne(query);
  } catch (e) {
    // fallback
  }

  if (!connection) {
    const sellerIdStr = sellerId ? sellerId.toString() : '';
    connection = Array.from(inMemoryChannelsMap.values()).find(
      (c) =>
        (c.sellerId?.toString() === sellerIdStr || c.tenantId?.toString() === sellerIdStr) &&
        (c.provider === 'AMAZON' || c.channel === 'amazon')
    );
  }

  if (!connection || connection.status !== 'CONNECTED' || !connection.credentials) {
    const err = new Error('Active Amazon channel connection is required. Please authorize Amazon first.');
    err.code = 'AMAZON_NOT_CONNECTED';
    err.status = 400;
    throw err;
  }

  const decrypted = decryptCredentials(connection.credentials);
  if (!decrypted || !decrypted.refreshToken) {
    const err = new Error('Could not decrypt Amazon credentials. Please reconnect the channel.');
    err.code = 'DECRYPTION_FAILED';
    err.status = 400;
    throw err;
  }

  const client = new AmazonSpApiClient({
    refreshToken: decrypted.refreshToken,
    region: connection.marketplaceRegion || 'eu',
    marketplaceId: connection.marketplaceId || 'A21TJRUUN4KGV',
  });

  const sellingPartnerId = connection.sellingPartnerId || connection.externalAccountId || decrypted.sellingPartnerId;
  return {
    client,
    connection,
    sellingPartnerId,
    marketplaceId: connection.marketplaceId || 'A21TJRUUN4KGV',
  };
};

/**
 * Search Amazon Catalog Items (SP-API v2022-04-01)
 * Read-only
 */
export const searchAmazonCatalog = async (req, res) => {
  try {
    const { keywords, identifiers, identifiersType } = req.query;
    if (!keywords && !identifiers) {
      return errorResponse(res, 400, 'Search requires either keywords or identifiers query parameter.');
    }

    const { client } = await getAmazonClientForTenant(req.tenant.sellerId);
    const results = await searchCatalogItems(client, req.query);

    return successResponse(res, 200, 'Amazon catalog items retrieved successfully', results);
  } catch (error) {
    console.error('Search Amazon Catalog Error:', error);
    const status = error.status || (error.code === 'AMAZON_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to search Amazon catalog');
  }
};

/**
 * Get Amazon Catalog Item by ASIN (SP-API v2022-04-01)
 * Read-only
 */
export const getAmazonCatalogItemByAsin = async (req, res) => {
  try {
    const { asin } = req.params;
    if (!asin || !asin.trim()) {
      return errorResponse(res, 400, 'Valid ASIN parameter is required.');
    }

    const { client } = await getAmazonClientForTenant(req.tenant.sellerId);
    const item = await getCatalogItem(client, asin.trim(), req.query);

    return successResponse(res, 200, 'Amazon catalog item details retrieved', { item });
  } catch (error) {
    console.error('Get Amazon Catalog Item Error:', error);
    const status = error.status || (error.code === 'AMAZON_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to retrieve Amazon catalog item');
  }
};

/**
 * Get Amazon Seller Listings (Stored & Live Read-Only v2021-08-01)
 */
export const getAmazonListings = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Filter by sellerId, provider AMAZON, and optional search
    const query = { sellerId, provider: 'AMAZON' };
    if (req.query.status) {
      query.status = req.query.status.toUpperCase();
    }
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [{ title: searchRegex }, { externalSku: searchRegex }, { asin: searchRegex }];
    }

    let listings = [];
    let total = 0;

    try {
      [listings, total] = await Promise.all([
        MarketplaceListing.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('productId', 'title sku masterPrice images stock'),
        MarketplaceListing.countDocuments(query),
      ]);
    } catch (dbErr) {
      console.warn('DB listings lookup error, reading memory map:', dbErr.message);
      const memListings = Array.from(inMemoryListingsMap.values()).filter(
        (l) => l.sellerId?.toString() === sellerId?.toString() && l.provider === 'AMAZON'
      );
      total = memListings.length;
      listings = memListings.slice(skip, skip + limit);
    }

    return successResponse(res, 200, 'Amazon seller listings retrieved successfully', {
      listings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Get Amazon Listings Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon listings');
  }
};

/**
 * Get Amazon Listing by SKU (Stored & Live v2021-08-01)
 */
export const getAmazonListingBySku = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { sku } = req.params;

    if (!sku || !sku.trim()) {
      return errorResponse(res, 400, 'Valid SKU is required.');
    }

    const cleanSku = sku.trim();
    let listing = null;

    try {
      listing = await MarketplaceListing.findOne({
        sellerId,
        provider: 'AMAZON',
        externalSku: cleanSku,
      }).populate('productId', 'title sku masterPrice images stock');
    } catch (e) {
      listing = inMemoryListingsMap.get(`list-${cleanSku}`);
    }

    // If live query requested or not in DB, attempt live fetch via Listings Items API
    if (req.query.live === 'true' || !listing) {
      try {
        const { client, sellingPartnerId, marketplaceId } = await getAmazonClientForTenant(sellerId);
        const liveListing = await getListingsItem(client, sellingPartnerId, cleanSku, { marketplaceId });
        return successResponse(res, 200, 'Live Amazon listing item retrieved', { listing: liveListing, isLive: true });
      } catch (liveErr) {
        if (!listing) {
          return errorResponse(res, 404, `Listing with SKU "${cleanSku}" not found: ${liveErr.message}`);
        }
      }
    }

    if (!listing) {
      return errorResponse(res, 404, `Amazon listing with SKU "${cleanSku}" not found.`);
    }

    return successResponse(res, 200, 'Amazon listing item retrieved successfully', { listing, isLive: false });
  } catch (error) {
    console.error('Get Amazon Listing By SKU Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon listing item');
  }
};

/**
 * Trigger Amazon Seller Listings Synchronization
 * Read-only sync: imports seller listings into MarketplaceListing without altering Amazon
 */
export const triggerAmazonSync = async (req, res) => {
  try {
    const result = await syncAmazonSellerListingsService(req.tenant, req.body);
    return successResponse(res, 200, 'Amazon listings synchronization completed successfully', result);
  } catch (error) {
    console.error('Trigger Amazon Sync Error:', error);
    const status = error.status || (error.code === 'CHANNEL_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to synchronize Amazon listings');
  }
};

/**
 * Get Amazon Synchronization Status and History
 */
export const getAmazonSyncStatus = async (req, res) => {
  try {
    const result = await getAmazonSyncStatusService(req.tenant);
    return successResponse(res, 200, 'Amazon sync status retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Sync Status Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon sync status');
  }
};

/**
 * Get Amazon Inventory Records (Paginated)
 */
export const getAmazonInventory = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query = { sellerId };
    if (req.query.fulfillmentChannel) {
      query.fulfillmentChannel = req.query.fulfillmentChannel.toUpperCase();
    }
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [{ externalSku: searchRegex }, { asin: searchRegex }, { productName: searchRegex }];
    }

    let items = [];
    let total = 0;

    try {
      [items, total] = await Promise.all([
        MarketplaceInventory.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit),
        MarketplaceInventory.countDocuments(query),
      ]);
    } catch (e) {
      const memItems = Array.from(inMemoryInventoryMap.values()).filter(
        (i) => i.sellerId?.toString() === sellerId?.toString()
      );
      total = memItems.length;
      items = memItems.slice(skip, skip + limit);
    }

    return successResponse(res, 200, 'Amazon inventory retrieved successfully', {
      inventory: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Get Amazon Inventory Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon inventory');
  }
};

/**
 * Get Amazon Inventory by SKU
 */
export const getAmazonInventoryBySku = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { sku } = req.params;

    let item = null;
    try {
      item = await MarketplaceInventory.findOne({ sellerId, externalSku: sku.trim() });
    } catch (e) {
      item = inMemoryInventoryMap.get(`${sellerId}_${sku.trim()}`);
    }

    if (!item) {
      return errorResponse(res, 404, `Amazon inventory record for SKU "${sku}" not found.`);
    }

    return successResponse(res, 200, 'Amazon inventory item retrieved successfully', { item });
  } catch (error) {
    console.error('Get Amazon Inventory By SKU Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon inventory item');
  }
};

/**
 * Trigger Amazon Inventory Synchronization
 */
export const triggerAmazonInventorySync = async (req, res) => {
  try {
    const result = await syncAmazonInventoryService(req.tenant, req.body);
    if (result.status === 'FAILED') {
      const firstErr = result.stats?.errors?.[0]?.error || 'Failed to synchronize Amazon inventory';
      return errorResponse(res, 400, firstErr, result);
    }
    const message = result.status === 'EMPTY'
      ? 'Amazon inventory sync completed: 0 records found in this marketplace.'
      : result.status === 'PARTIAL'
      ? 'Amazon inventory sync completed with warnings.'
      : 'Amazon inventory synchronized successfully';
    return successResponse(res, 200, message, result);
  } catch (error) {
    console.error('Trigger Amazon Inventory Sync Error:', error);
    const status = error.status || (error.code === 'CHANNEL_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to synchronize Amazon inventory');
  }
};

/**
 * Get Amazon Inventory Sync Status
 */
export const getAmazonInventoryStatus = async (req, res) => {
  try {
    const result = await getAmazonInventoryStatusService(req.tenant);
    return successResponse(res, 200, 'Amazon inventory status retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Inventory Status Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon inventory status');
  }
};

/**
 * Get Amazon Pricing Records (Paginated)
 */
export const getAmazonPricing = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query = { sellerId };
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [{ externalSku: searchRegex }, { asin: searchRegex }, { title: searchRegex }];
    }

    let items = [];
    let total = 0;

    try {
      [items, total] = await Promise.all([
        MarketplacePricing.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit),
        MarketplacePricing.countDocuments(query),
      ]);
    } catch (e) {
      const memItems = Array.from(inMemoryPricingMap.values()).filter(
        (p) => p.sellerId?.toString() === sellerId?.toString()
      );
      total = memItems.length;
      items = memItems.slice(skip, skip + limit);
    }

    return successResponse(res, 200, 'Amazon pricing snapshots retrieved successfully', {
      pricing: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Get Amazon Pricing Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon pricing');
  }
};

/**
 * Get Amazon Pricing Snapshot by SKU
 */
export const getAmazonPricingBySku = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { sku } = req.params;

    let item = null;
    try {
      item = await MarketplacePricing.findOne({ sellerId, externalSku: sku.trim() });
    } catch (e) {
      item = inMemoryPricingMap.get(`${sellerId}_${sku.trim()}`);
    }

    if (!item) {
      return errorResponse(res, 404, `Amazon pricing snapshot for SKU "${sku}" not found.`);
    }

    return successResponse(res, 200, 'Amazon pricing snapshot retrieved successfully', { item });
  } catch (error) {
    console.error('Get Amazon Pricing By SKU Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon pricing snapshot');
  }
};

/**
 * Trigger Amazon Pricing Synchronization
 */
export const triggerAmazonPricingSync = async (req, res) => {
  try {
    const result = await syncAmazonPricingService(req.tenant, req.body);
    return successResponse(res, 200, 'Amazon pricing synchronized successfully', result);
  } catch (error) {
    console.error('Trigger Amazon Pricing Sync Error:', error);
    const status = error.status || (error.code === 'CHANNEL_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to synchronize Amazon pricing');
  }
};

/**
 * Get Amazon Pricing Sync Status
 */
export const getAmazonPricingStatus = async (req, res) => {
  try {
    const result = await getAmazonPricingStatusService(req.tenant);
    return successResponse(res, 200, 'Amazon pricing status retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Pricing Status Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon pricing status');
  }
};

/**
 * Task 6: Get Amazon Orders (Paginated, Filterable by status, fulfillmentChannel, search)
 */
export const getAmazonOrders = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const query = { sellerId, channel: 'AMAZON' };

    if (req.query.status && req.query.status !== 'All') {
      query.status = req.query.status.toUpperCase();
    }

    if (req.query.fulfillmentChannel && req.query.fulfillmentChannel !== 'All') {
      query.fulfillmentChannel = req.query.fulfillmentChannel.toUpperCase();
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [
        { externalOrderId: searchRegex },
        { orderNumber: searchRegex },
        { 'items.sku': searchRegex },
        { 'items.asin': searchRegex },
        { 'items.title': searchRegex },
      ];
    }

    let orders = [];
    let total = 0;

    try {
      [orders, total] = await Promise.all([
        Order.find(query).sort({ purchaseDate: -1, createdAt: -1 }).skip(skip).limit(limit),
        Order.countDocuments(query),
      ]);
    } catch (dbErr) {
      const memOrders = Array.from(inMemoryOrdersMap.values()).filter(
        (o) => o.sellerId?.toString() === sellerId?.toString() && o.channel === 'AMAZON'
      );
      total = memOrders.length;
      orders = memOrders.slice(skip, skip + limit);
    }

    return successResponse(res, 200, 'Amazon orders retrieved successfully', {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Get Amazon Orders Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon orders');
  }
};

/**
 * Task 6: Get Amazon Order by ID (Internal ObjectId or externalOrderId)
 */
export const getAmazonOrderById = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { orderId } = req.params;

    let order = null;
    try {
      order = await Order.findOne({
        sellerId,
        channel: 'AMAZON',
        $or: [{ _id: orderId }, { externalOrderId: orderId }, { orderNumber: orderId }],
      });
    } catch (dbErr) {
      order = Array.from(inMemoryOrdersMap.values()).find(
        (o) =>
          o.sellerId?.toString() === sellerId?.toString() &&
          o.channel === 'AMAZON' &&
          (o._id?.toString() === orderId || o.externalOrderId === orderId || o.orderNumber === orderId)
      );
    }

    if (!order) {
      return errorResponse(res, 404, `Amazon order "${orderId}" not found`);
    }

    return successResponse(res, 200, 'Amazon order retrieved successfully', { order });
  } catch (error) {
    console.error('Get Amazon Order By ID Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon order');
  }
};

/**
 * Task 6: Trigger Amazon Orders Synchronization
 */
export const triggerAmazonOrdersSync = async (req, res) => {
  try {
    const result = await syncAmazonOrdersService(req.tenant, req.body);
    return successResponse(res, 200, 'Amazon orders synchronized successfully', result);
  } catch (error) {
    console.error('Trigger Amazon Orders Sync Error:', error);
    const status = error.status || (error.code === 'SYNC_IN_PROGRESS' ? 409 : error.code === 'CHANNEL_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to synchronize Amazon orders');
  }
};

/**
 * Task 6: Get Amazon Orders Status
 */
export const getAmazonOrdersStatus = async (req, res) => {
  try {
    const result = await getAmazonOrdersStatusService(req.tenant);
    return successResponse(res, 200, 'Amazon orders status retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Orders Status Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon orders status');
  }
};

/**
 * Task 7: Get Amazon Order Details (authorized order info, items, fulfillment, returns & refunds)
 */
export const getAmazonOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const syncLive = req.query.sync === 'true';
    const result = await getAmazonOrderDetailsService(req.tenant, orderId, { syncLive });
    return successResponse(res, 200, 'Amazon order details retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Order Details Error:', error);
    const status = error.status || (error.code === 'ORDER_NOT_FOUND' ? 404 : error.code === 'UNAUTHORIZED_ACCESS' ? 403 : 500);
    return errorResponse(res, status, error.message || 'Failed to retrieve Amazon order details');
  }
};

/**
 * Task 7: Get Amazon Order Line Items
 */
export const getAmazonOrderItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await getAmazonOrderItemsService(req.tenant, orderId);
    return successResponse(res, 200, 'Amazon order items retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Order Items Error:', error);
    const status = error.status || (error.code === 'ORDER_NOT_FOUND' ? 404 : 500);
    return errorResponse(res, status, error.message || 'Failed to retrieve Amazon order items');
  }
};

/**
 * Task 7: Sync a single Amazon Order from SP-API v2026-01-01
 */
export const syncSingleAmazonOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await syncSingleAmazonOrderService(req.tenant, orderId);
    return successResponse(res, 200, 'Amazon order synchronized successfully', result);
  } catch (error) {
    console.error('Sync Single Amazon Order Error:', error);
    const status = error.status || (error.code === 'AMAZON_ORDER_NOT_FOUND' ? 404 : error.code === 'CHANNEL_NOT_CONNECTED' ? 400 : 500);
    return errorResponse(res, status, error.message || 'Failed to synchronize Amazon order');
  }
};

/**
 * Task 7: Get Amazon Returns (Read-Only)
 */
export const getAmazonReturns = async (req, res) => {
  try {
    const result = await getAmazonReturnsService(req.tenant, req.query);
    return successResponse(res, 200, 'Amazon returns retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Returns Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon returns');
  }
};

/**
 * Task 7: Get Amazon Return by ID
 */
export const getAmazonReturnById = async (req, res) => {
  try {
    const { returnId } = req.params;
    const { sellerId } = req.tenant;

    let ret = null;
    try {
      ret = await Return.findOne({
        sellerId,
        $or: [{ _id: returnId }, { rmaNumber: returnId }, { externalOrderId: returnId }],
      }).populate('orderId');
    } catch (dbErr) {
      ret = Array.from(inMemoryReturnsMap.values()).find(
        (r) =>
          r.sellerId?.toString() === sellerId?.toString() &&
          (r._id === returnId || r.rmaNumber === returnId || r.externalOrderId === returnId)
      );
    }

    if (!ret) {
      return errorResponse(res, 404, `Amazon return "${returnId}" not found`);
    }

    return successResponse(res, 200, 'Amazon return retrieved successfully', { return: ret });
  } catch (error) {
    console.error('Get Amazon Return By ID Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon return');
  }
};

/**
 * Task 7: Get Amazon Order Refund Details
 */
export const getAmazonOrderRefunds = async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await getAmazonOrderRefundsService(req.tenant, orderId);
    return successResponse(res, 200, 'Amazon order refund details retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Order Refunds Error:', error);
    const status = error.status || (error.code === 'ORDER_NOT_FOUND' ? 404 : 500);
    return errorResponse(res, status, error.message || 'Failed to retrieve Amazon order refund details');
  }
};

/**
 * Task 7: Trigger Amazon Returns & Refunds Synchronization (Read-Only)
 */
export const triggerAmazonReturnsSync = async (req, res) => {
  try {
    const result = await syncAmazonReturnsService(req.tenant, req.body);
    return successResponse(res, 200, 'Amazon returns synchronized successfully', result);
  } catch (error) {
    console.error('Trigger Amazon Returns Sync Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to synchronize Amazon returns');
  }
};

/**
 * Task 7: Get Amazon Returns & Refunds Status Telemetry
 */
export const getAmazonReturnsStatus = async (req, res) => {
  try {
    const result = await getAmazonReturnsStatusService(req.tenant);
    return successResponse(res, 200, 'Amazon returns status retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Returns Status Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon returns status');
  }
};

/**
 * =========================================================================
 * TASK 9: AMAZON PRODUCT LISTING & PUBLISHING WORKFLOW CONTROLLERS
 * =========================================================================
 */

/**
 * Get eligible products from central catalogue for Amazon listing
 * @route GET /api/channels/amazon/products/eligible
 */
export const getEligibleCatalogueProducts = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { q, page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = { sellerId };
    if (q && q.trim()) {
      const cleanQ = q.trim();
      query.$or = [
        { title: { $regex: cleanQ, $options: 'i' } },
        { sku: { $regex: cleanQ, $options: 'i' } },
        { brand: { $regex: cleanQ, $options: 'i' } },
      ];
    }

    let products = [];
    let total = 0;
    try {
      [products, total] = await Promise.all([
        Product.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limitNum).lean(),
        Product.countDocuments(query),
      ]);
    } catch (dbErr) {
      // In-memory fallback if database query times out
      products = [];
      total = 0;
    }

    return successResponse(res, 200, 'Eligible catalogue products retrieved successfully', {
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Get Eligible Catalogue Products Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve catalogue products');
  }
};

/**
 * Get available Amazon product types (Definitions API)
 * @route GET /api/channels/amazon/definitions/product-types
 */
export const getAmazonProductTypes = async (req, res) => {
  try {
    const { q, marketplaceId } = req.query;
    const result = await searchProductTypes(null, {
      keywords: q,
      marketplaceId: marketplaceId || 'A21TJRUUN4KGV',
    });
    return successResponse(res, 200, 'Amazon product types retrieved successfully', result);
  } catch (error) {
    console.error('Get Amazon Product Types Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve Amazon product types');
  }
};

/**
 * Get schema definition for a specific product type
 * @route GET /api/channels/amazon/definitions/product-types/:productType
 */
export const getAmazonProductTypeSchema = async (req, res) => {
  try {
    const { productType } = req.params;
    const { marketplaceId } = req.query;
    const result = await getProductTypeDefinition(null, productType, {
      marketplaceId: marketplaceId || 'A21TJRUUN4KGV',
    });
    return successResponse(res, 200, `Schema for ${productType.toUpperCase()} retrieved successfully`, result);
  } catch (error) {
    console.error('Get Amazon Product Type Schema Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve product type schema');
  }
};

/**
 * Validate listing attributes and preview issues
 * @route POST /api/channels/amazon/listings/submissions/validate
 */
export const validateAmazonListing = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { productId, mappedAttributes, productType, gtinExemption, gtinExemptionRequested, sellerSku } = req.body;

    if (!productId) {
      return errorResponse(res, 400, 'productId is required for listing validation');
    }

    let product = null;
    try {
      product = await Product.findOne({ _id: productId, sellerId }).lean();
    } catch (e) {
      // fallback
    }

    if (!product) {
      return errorResponse(res, 404, 'Master product not found in catalogue');
    }

    const isExempt = Boolean(gtinExemption ?? gtinExemptionRequested ?? mappedAttributes?.gtinExemptionRequested);

    const validation = validateListingData({
      product,
      mappedAttributes: mappedAttributes || {},
      productType: productType || 'SHIRT',
      gtinExemption: isExempt,
    });

    const payloadPreview = buildSpApiListingPayload({
      product,
      mappedAttributes: mappedAttributes || {},
      productType: productType || 'SHIRT',
      marketplaceId: req.body.marketplaceId || 'A21TJRUUN4KGV',
      sellerSku: sellerSku || product.sku,
      gtinExemption: isExempt,
    });

    return successResponse(res, 200, 'Listing attributes validated', {
      valid: validation.valid,
      issues: validation.issues,
      errors: validation.errors,
      warnings: validation.warnings,
      payloadPreview,
    });
  } catch (error) {
    console.error('Validate Amazon Listing Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to validate listing');
  }
};

/**
 * Create or update a draft listing submission
 * @route POST /api/channels/amazon/listings/submissions
 */
export const createOrUpdateAmazonListingSubmission = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const {
      productId,
      productType,
      sellerSku,
      mappedAttributes = {},
      gtinExemptionRequested = false,
      gtinExemptionReason = '',
      marketplaceId = 'A21TJRUUN4KGV',
    } = req.body;

    if (!productId) {
      return errorResponse(res, 400, 'productId is required');
    }

    let product = null;
    try {
      product = await Product.findOne({ _id: productId, sellerId }).lean();
    } catch (e) {
      // fallback
    }

    if (!product) {
      return errorResponse(res, 404, 'Product not found in central catalogue');
    }

    const cleanSku = (sellerSku || product.sku || '').trim().toUpperCase();
    if (!cleanSku) {
      return errorResponse(res, 400, 'sellerSku is required');
    }

    // Resolve channel connection
    const connQuery = buildTenantConnectionQuery(sellerId, 'AMAZON');
    let connection = null;
    try {
      connection = await ChannelConnection.findOne(connQuery).lean();
    } catch (e) {
      // fallback
    }
    if (!connection) {
      connection = Array.from(inMemoryChannelsMap.values()).find(
        (c) =>
          (c.sellerId?.toString() === sellerId?.toString() || c.tenantId?.toString() === sellerId?.toString()) &&
          (c.provider === 'AMAZON' || c.channel === 'amazon')
      );
    }

    const channelConnectionId = connection?._id || connection?.id || 'demo-conn-id';

    // Validate listing data
    const validation = validateListingData({
      product,
      mappedAttributes,
      productType: productType || 'SHIRT',
      gtinExemption: Boolean(gtinExemptionRequested),
    });

    const payloadPreview = buildSpApiListingPayload({
      product,
      mappedAttributes,
      productType: productType || 'SHIRT',
      marketplaceId,
      sellerSku: cleanSku,
      gtinExemption: Boolean(gtinExemptionRequested),
    });

    const initialStatus = validation.valid ? 'READY' : 'VALIDATION_FAILED';

    const submissionData = {
      sellerId: sellerId.toString(),
      tenantId: sellerId.toString(),
      channelConnectionId,
      provider: 'AMAZON',
      marketplaceId,
      environment: 'sandbox',
      productId: product._id.toString(),
      sellerSku: cleanSku,
      productType: (productType || 'SHIRT').trim().toUpperCase(),
      mappedAttributes,
      payloadPreview,
      status: initialStatus,
      issues: validation.issues,
      gtinExemptionRequested: Boolean(gtinExemptionRequested),
      gtinExemptionReason,
      lastCheckedAt: new Date(),
    };

    let doc = null;
    try {
      const filter = {
        sellerId: sellerId.toString(),
        marketplaceId,
        sellerSku: cleanSku,
        environment: 'sandbox',
      };
      doc = await MarketplaceListingSubmission.findOneAndUpdate(
        filter,
        { $set: submissionData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dbErr) {
      // Memory map fallback
      const id = `sub_${Date.now()}`;
      doc = { _id: id, id, ...submissionData, createdAt: new Date(), updatedAt: new Date() };
      inMemorySubmissionsMap.set(id, doc);
    }

    if (doc && doc._id) {
      inMemorySubmissionsMap.set(doc._id.toString(), doc);
    }

    return successResponse(res, 201, 'Listing submission created/updated successfully', {
      submission: doc,
      valid: validation.valid,
      issues: validation.issues,
      payloadPreview,
    });
  } catch (error) {
    console.error('Create Listing Submission Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to save listing submission');
  }
};

/**
 * Submit listing to Amazon SP-API Sandbox or execute Dry Run
 * @route POST /api/channels/amazon/listings/submissions/:id/submit
 */
export const submitAmazonListing = async (req, res) => {
  try {
    const { id } = req.params;
    const { dryRun, submissionMode, mode, environment } = req.body;

    const requestedMode = submissionMode || mode || (dryRun === false ? 'SANDBOX_SUBMISSION' : 'DRY_RUN');
    const isDryRun = requestedMode === 'DRY_RUN';

    const result = await executeListingSubmission({
      tenant: req.tenant,
      submissionId: id,
      dryRun: isDryRun,
      mode: requestedMode,
      environment: environment || process.env.AMAZON_SP_API_ENV,
    });

    const message = result.isDryRun
      ? 'Dry run validation completed successfully. Payload ready for Amazon SP-API submission.'
      : result.success
      ? 'Listing submitted to Amazon SP-API Sandbox successfully.'
      : 'Listing submission was rejected by Amazon SP-API Sandbox.';

    return successResponse(res, 200, message, result);
  } catch (error) {
    console.error('Submit Amazon Listing Error:', error);
    const status = error.status || (error.code === 'PRODUCTION_PUBLISHING_DISABLED' ? 403 : 500);
    return errorResponse(res, status, error.message || 'Failed to execute listing submission', null, error.code);
  }
};

/**
 * Get listing submissions history for tenant
 * @route GET /api/channels/amazon/listings/submissions
 */
export const getAmazonListingSubmissions = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { page = 1, limit = 20, status } = req.query;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = { sellerId: sellerId.toString() };
    if (status && status !== 'All') {
      query.status = status.toUpperCase();
    }

    let submissions = [];
    let total = 0;
    try {
      [submissions, total] = await Promise.all([
        MarketplaceListingSubmission.find(query)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .populate('productId', 'title masterPrice images stock sku')
          .lean(),
        MarketplaceListingSubmission.countDocuments(query),
      ]);
    } catch (e) {
      // Memory fallback
      submissions = Array.from(inMemorySubmissionsMap.values()).filter(
        (s) => s.sellerId?.toString() === sellerId?.toString()
      );
      total = submissions.length;
    }

    return successResponse(res, 200, 'Listing submissions retrieved successfully', {
      submissions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Get Listing Submissions Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve listing submissions');
  }
};

/**
 * Get single listing submission details
 * @route GET /api/channels/amazon/listings/submissions/:id
 */
export const getAmazonListingSubmissionById = async (req, res) => {
  try {
    const { sellerId } = req.tenant;
    const { id } = req.params;

    let submission = null;
    try {
      submission = await MarketplaceListingSubmission.findOne({
        _id: id,
        sellerId: sellerId.toString(),
      })
        .populate('productId', 'title masterPrice images stock sku description brand')
        .lean();
    } catch (e) {
      submission = inMemorySubmissionsMap.get(id);
    }

    if (!submission) {
      submission = inMemorySubmissionsMap.get(id);
    }

    if (!submission) {
      return errorResponse(res, 404, 'Listing submission not found for this seller');
    }

    return successResponse(res, 200, 'Listing submission details retrieved successfully', {
      submission,
    });
  } catch (error) {
    console.error('Get Listing Submission By Id Error:', error);
    return errorResponse(res, 500, error.message || 'Failed to retrieve listing submission');
  }
};





