import { ChannelConnection } from '../../../modules/channels/channelConnection.model.js';
import { MarketplaceInventory } from '../../../modules/channels/marketplaceInventory.model.js';
import { MarketplaceListing } from '../../../modules/channels/marketplaceListing.model.js';
import { SyncHistory } from '../../../modules/channels/syncHistory.model.js';
import { decryptCredentials } from '../../../utils/encryption.js';
import { AmazonSpApiClient } from './amazon.client.js';
import { mapFbaInventorySummary, mapFbmInventoryItem } from './amazon.inventory.mapper.js';
import {
  inMemoryChannelsMap,
  buildTenantConnectionQuery,
  matchesTenantStore,
} from '../../../modules/channels/channel.service.js';
import { isProductionEnv } from '../../../config/storage.js';

// In-memory fallback map for inventory testing
export const inMemoryInventoryMap = new Map();

const withDbTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`DB operation timed out after ${ms}ms`)), ms)),
  ]);
};

/**
 * Retrieve FBA Inventory Summaries using FBA Inventory API v1
 * Read-only operation.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV']
 * @param {string|string[]} [options.sellerSkus]
 * @param {string} [options.nextToken]
 * @param {boolean} [options.fetchAllPages=false]
 * @param {number} [options.maxPages=10]
 * @returns {Promise<{ inventory: Array, pagination: Object, diagnostics: Object }>}
 */
export const getFbaInventorySummaries = async (client, options = {}) => {
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';

  const queryParams = new URLSearchParams({
    granularityType: 'Marketplace',
    granularityId: marketplaceId,
    marketplaceIds: marketplaceId,
    details: 'true',
  });

  if (options.sellerSkus) {
    const skusArr = Array.isArray(options.sellerSkus)
      ? options.sellerSkus
      : String(options.sellerSkus).split(',').map((s) => s.trim()).filter(Boolean);
    if (skusArr.length > 0) {
      queryParams.set('sellerSkus', skusArr.join(','));
    }
  }

  if (options.nextToken) {
    queryParams.set('nextToken', options.nextToken);
  }

  const endpointPath = `/fba/inventory/v1/summaries?${queryParams.toString()}`;

  try {
    const responseData = await client.executeRequest(endpointPath);
    let rawSummaries = responseData.payload?.inventorySummaries || responseData.inventorySummaries || [];
    let nextToken = responseData.pagination?.nextToken || responseData.nextToken || null;

    // Follow pagination if requested and nextToken exists
    if (options.fetchAllPages && nextToken) {
      const maxPages = options.maxPages || 10;
      let pageCount = 1;
      while (nextToken && pageCount < maxPages) {
        pageCount++;
        const nextParams = new URLSearchParams(queryParams);
        nextParams.set('nextToken', nextToken);
        const nextEndpoint = `/fba/inventory/v1/summaries?${nextParams.toString()}`;
        try {
          const nextData = await client.executeRequest(nextEndpoint);
          const pageSummaries = nextData.payload?.inventorySummaries || nextData.inventorySummaries || [];
          rawSummaries = rawSummaries.concat(pageSummaries);
          nextToken = nextData.pagination?.nextToken || nextData.nextToken || null;
        } catch (pageErr) {
          console.warn(`[Amazon SP-API Diagnostics] FBA inventory pagination page ${pageCount} aborted: ${pageErr.message}`);
          break;
        }
      }
    }

    const normalized = rawSummaries.map((item) =>
      mapFbaInventorySummary(item, { marketplaceId })
    );

    const diagnostics = {
      httpStatus: responseData._metadata?.status || client.lastHttpStatus || 200,
      requestId: responseData._metadata?.requestId || client.lastRequestId || null,
      itemCount: normalized.length,
      endpoint: '/fba/inventory/v1/summaries',
      method: 'GET',
      isSandbox: Boolean(client.isSandbox),
      marketplaceId,
    };

    console.log(
      `[Amazon SP-API Diagnostics] FBA Inventory Summaries: ${normalized.length} items parsed | HTTP ${diagnostics.httpStatus} | RequestId: ${diagnostics.requestId || 'N/A'}`
    );

    return {
      inventory: normalized,
      pagination: {
        nextToken,
      },
      marketplaceId,
      diagnostics,
    };
  } catch (error) {
    const diagnostics = {
      httpStatus: error.status || 500,
      requestId: error.requestId || client.lastRequestId || null,
      itemCount: 0,
      endpoint: '/fba/inventory/v1/summaries',
      method: 'GET',
      errorCode: error.code || 'API_ERROR',
      errorMessage: error.message,
      isSandbox: Boolean(client.isSandbox),
      marketplaceId,
    };

    console.warn(
      `[Amazon SP-API Diagnostics] FBA Inventory Summaries Error: HTTP ${diagnostics.httpStatus} | RequestId: ${diagnostics.requestId || 'N/A'} | Error: ${error.message}`
    );

    // Provide structured error diagnostics rather than silently converting to empty success
    return {
      inventory: [],
      pagination: { nextToken: null },
      marketplaceId,
      error: error.message,
      errorCode: error.code || 'API_ERROR',
      httpStatus: error.status || 500,
      requestId: error.requestId || client.lastRequestId || null,
      diagnostics,
      note: error.status === 404 || error.status === 400
        ? 'No FBA inventory summaries provisioned on Amazon Sandbox.'
        : `Amazon SP-API FBA Inventory error: ${error.message}`,
    };
  }
};

/**
 * Synchronize Amazon Inventory (FBA + FBM) for a Tenant
 * Strictly read-only: does not alter inventory on Amazon or master Product.stock.
 *
 * @param {Object} tenant { sellerId }
 * @param {Object} [options]
 * @returns {Promise<Object>} Sync outcome
 */
export const syncAmazonInventoryService = async (tenant, options = {}) => {
  const { sellerId } = tenant;
  const startedAt = new Date();

  // 1. Verify channel connection with robust tenant/sellerId + storeId query
  const storeId = tenant?.storeId || null;
  const connQuery = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
  let connection = null;
  try {
    connection = await withDbTimeout(ChannelConnection.findOne(connQuery), 1500);
  } catch (e) {
    if (isProductionEnv()) {
      const dbErr = new Error('Service Unavailable: Unable to verify Amazon connection in MongoDB.');
      dbErr.code = 'SERVICE_UNAVAILABLE';
      dbErr.status = 503;
      throw dbErr;
    }
  }

  if (!connection && !isProductionEnv()) {
    connection = Array.from(inMemoryChannelsMap.values()).find(
      (c) =>
        matchesTenantStore(c, { sellerId, storeId }) &&
        (c.provider === 'AMAZON' || c.channel === 'amazon')
    );
  }

  if (!connection) {
    const err = new Error('Amazon channel connection not found. Please connect your Amazon Seller account first.');
    err.code = 'CHANNEL_NOT_FOUND';
    throw err;
  }

  if (connection.status !== 'CONNECTED' || !connection.credentials) {
    const err = new Error(`Amazon channel is not active (current status: ${connection.status}). Please reconnect.`);
    err.code = 'CHANNEL_NOT_CONNECTED';
    throw err;
  }

  const decrypted = decryptCredentials(connection.credentials);
  if (!decrypted || !decrypted.refreshToken) {
    const err = new Error('Failed to decrypt Amazon credentials.');
    err.code = 'DECRYPTION_FAILED';
    throw err;
  }

  const marketplaceId = options.marketplaceId || connection.marketplaceId || 'A21TJRUUN4KGV';
  const region = connection.marketplaceRegion || 'eu';

  // 2. Initialize tenant-scoped client
  const client = new AmazonSpApiClient({
    sellerId: sellerId ? sellerId.toString() : null,
    refreshToken: decrypted.refreshToken,
    region,
    marketplaceId,
  });

  const syncStats = {
    totalFetched: 0,
    totalCreated: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    recordsFailed: 0,
    errors: [],
  };

  // 3. Fetch FBA inventory summaries with real request & pagination
  let fbaItems = [];
  let fbaDiagnostics = null;
  try {
    const fbaResult = await getFbaInventorySummaries(client, {
      marketplaceId,
      fetchAllPages: true,
    });
    fbaItems = fbaResult.inventory || [];
    fbaDiagnostics = fbaResult.diagnostics || {
      httpStatus: fbaResult.httpStatus || 200,
      requestId: fbaResult.requestId || null,
      itemCount: fbaItems.length,
      isSandbox: Boolean(client.isSandbox),
    };

    if (fbaResult.error) {
      syncStats.errors.push({
        source: 'FBA',
        error: fbaResult.error,
        code: fbaResult.errorCode,
        httpStatus: fbaResult.httpStatus,
        requestId: fbaResult.requestId,
      });
      syncStats.recordsFailed++;
    }
  } catch (fbaErr) {
    syncStats.errors.push({ source: 'FBA', error: fbaErr.message });
    syncStats.recordsFailed++;
  }

  // 4. Fetch known seller listings to capture merchant-fulfilled (FBM) stock
  let listings = [];
  try {
    listings = await withDbTimeout(MarketplaceListing.find({ sellerId, channelId: connection._id || connection.id }), 1500);
  } catch (e) {
    // fallback
  }

  const fbaSkuSet = new Set(fbaItems.map((i) => i.externalSku));
  const inventoryPayloads = [];

  // Add FBA items
  for (const item of fbaItems) {
    inventoryPayloads.push({
      ...item,
      sellerId,
      channelId: connection._id || connection.id,
      marketplaceId,
    });
  }

  // Add FBM items for listings not in FBA
  for (const listing of listings) {
    if (!fbaSkuSet.has(listing.externalSku)) {
      const fbmRecord = mapFbmInventoryItem(listing, {
        sellerId,
        channelId: connection._id || connection.id,
        marketplaceId,
      });
      if (fbmRecord) inventoryPayloads.push(fbmRecord);
    }
  }

  syncStats.totalFetched = inventoryPayloads.length;

  // 5. Upsert inventory records idempotently
  for (const record of inventoryPayloads) {
    try {
      const filter = {
        sellerId,
        channelId: connection._id || connection.id,
        externalSku: record.externalSku,
      };

      let existing = null;
      try {
        existing = await MarketplaceInventory.findOne(filter);
        await MarketplaceInventory.findOneAndUpdate(filter, record, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        });
      } catch (dbErr) {
        // memory map fallback
        existing = inMemoryInventoryMap.get(`${sellerId}_${record.externalSku}`);
        inMemoryInventoryMap.set(`${sellerId}_${record.externalSku}`, record);
      }

      if (existing) {
        syncStats.totalUpdated++;
      } else {
        syncStats.totalCreated++;
      }
    } catch (recordErr) {
      syncStats.recordsFailed++;
      syncStats.errors.push({ sku: record.externalSku, error: recordErr.message });
    }
  }

  const completedAt = new Date();

  // Determine final status without falsely claiming SUCCESS when 0 records are fetched
  let finalStatus;
  if (syncStats.recordsFailed > 0 && syncStats.totalCreated + syncStats.totalUpdated === 0) {
    finalStatus = 'FAILED';
  } else if (syncStats.recordsFailed > 0) {
    finalStatus = 'PARTIAL';
  } else if (syncStats.totalFetched === 0) {
    finalStatus = 'EMPTY';
  } else {
    finalStatus = 'SUCCESS';
  }

  // 6. Record SyncHistory
  try {
    await SyncHistory.create({
      sellerId,
      channelId: connection._id || connection.id,
      provider: 'AMAZON',
      syncType: 'INVENTORY',
      direction: 'IMPORT',
      status: finalStatus === 'EMPTY' ? 'SUCCESS' : finalStatus,
      startedAt,
      completedAt,
      recordsProcessed: syncStats.totalFetched,
      recordsSucceeded: syncStats.totalCreated + syncStats.totalUpdated,
      recordsFailed: syncStats.recordsFailed,
      totalFetched: syncStats.totalFetched,
      totalCreated: syncStats.totalCreated,
      totalUpdated: syncStats.totalUpdated,
      totalSkipped: syncStats.totalSkipped,
      metadata: {
        outcome: finalStatus,
        isZeroRecords: syncStats.totalFetched === 0,
        diagnostics: fbaDiagnostics,
      },
    });
  } catch (e) {
    // ignore
  }

  return {
    success: finalStatus !== 'FAILED',
    status: finalStatus,
    isZeroRecords: syncStats.totalFetched === 0,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    stats: syncStats,
    diagnostics: {
      fba: fbaDiagnostics,
      realRequestSent: true,
      endpoint: '/fba/inventory/v1/summaries',
      method: 'GET',
      marketplaceId,
      region,
      isSandbox: Boolean(client.isSandbox),
    },
  };
};

/**
 * Compatibility wrapper for AmazonAdapter.fetchInventory
 */
export const fetchAmazonInventory = async (client, params = {}) => {
  return await getFbaInventorySummaries(client, params);
};

/**
 * Strict prohibition on write operations (read-only integration mode)
 */
export const updateAmazonInventory = async (client, sku, quantity) => {
  throw new Error('Direct Amazon inventory mutation is disabled in read-only mode.');
};

/**
 * Get Amazon Inventory sync status and records count
 */
export const getAmazonInventoryStatusService = async (tenant) => {
  const { sellerId } = tenant;

  let latestSync = null;
  try {
    latestSync = await SyncHistory.findOne({ sellerId, provider: 'AMAZON', syncType: 'INVENTORY' }).sort({ createdAt: -1 });
  } catch (e) {
    // fallback
  }

  let totalRecords = 0;
  try {
    totalRecords = await MarketplaceInventory.countDocuments({ sellerId });
  } catch (e) {
    totalRecords = Array.from(inMemoryInventoryMap.values()).filter(
      (i) => i.sellerId?.toString() === sellerId?.toString()
    ).length;
  }

  return {
    latestSync,
    totalRecords,
  };
};
