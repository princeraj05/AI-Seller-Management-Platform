import { ChannelConnection } from '../../../modules/channels/channelConnection.model.js';
import { MarketplacePricing } from '../../../modules/channels/marketplacePricing.model.js';
import { MarketplaceListing } from '../../../modules/channels/marketplaceListing.model.js';
import { SyncHistory } from '../../../modules/channels/syncHistory.model.js';
import { decryptCredentials } from '../../../utils/encryption.js';
import { AmazonSpApiClient, AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';
import { mapAmazonOffersToPricing } from './amazon.pricing.mapper.js';
import {
  inMemoryChannelsMap,
  buildTenantConnectionQuery,
  matchesTenantStore,
} from '../../../modules/channels/channel.service.js';
import { isProductionEnv } from '../../../config/storage.js';

// In-memory fallback map for pricing testing
export const inMemoryPricingMap = new Map();

const withDbTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`DB operation timed out after ${ms}ms`)), ms)),
  ]);
};

const wrapPricingApiError = (error, client, { marketplaceId, operation }) => {
  const diagnostics =
    error.diagnostics ||
    (typeof client?.getLastRequestDiagnostics === 'function'
      ? client.getLastRequestDiagnostics()
      : null);
  const amazonFirstError = Array.isArray(error.sanitizedData?.errors)
    ? error.sanitizedData.errors[0]
    : null;
  const amazonErrorCode = amazonFirstError?.code || error.code || 'API_ERROR';
  const amazonErrorMessage =
    amazonFirstError?.message || error.message || 'Amazon Product Pricing API request failed.';
  const amazonErrorDetails = amazonFirstError?.details || '';

  const wrapped = new Error(amazonErrorMessage);
  wrapped.status = error.status || 500;
  wrapped.code =
    error.status === 401
      ? 'LWA_UNAUTHORIZED'
      : error.status === 403
      ? /not valid for region/i.test(`${amazonErrorMessage} ${amazonErrorDetails}`)
        ? 'MARKETPLACE_REGION_MISMATCH'
        : 'SP_API_FORBIDDEN'
      : error.status === 429
      ? 'RATE_LIMITED'
      : error.status === 400
      ? 'PRICING_BAD_REQUEST'
      : error.code || amazonErrorCode || 'PRICING_API_ERROR';
  wrapped.amazonErrorCode = amazonErrorCode;
  wrapped.amazonErrorMessage = amazonErrorMessage;
  wrapped.amazonErrorDetails = amazonErrorDetails;
  wrapped.marketplaceId = marketplaceId;
  wrapped.environment = client?.isSandbox !== false ? 'sandbox' : 'production';
  wrapped.region = client?.region || 'eu';
  wrapped.operation = operation;
  wrapped.diagnostics = diagnostics;
  wrapped.executionOutcome = AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE;
  return wrapped;
};

/**
 * Get pricing and offers for an Item by ASIN using Product Pricing API v0
 * Strictly read-only operation. Preserves India marketplace A21TJRUUN4KGV & INR currency mapping.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {string} asin
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export const getItemOffers = async (client, asin, options = {}) => {
  if (!asin || !asin.trim()) {
    const err = new Error('ASIN is required to fetch item pricing offers.');
    err.code = 'INVALID_ASIN';
    err.status = 400;
    throw err;
  }

  const cleanAsin = asin.trim().toUpperCase();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';
  const itemCondition = options.itemCondition || 'New';

  const queryParams = new URLSearchParams({
    MarketplaceId: marketplaceId,
    ItemCondition: itemCondition,
  });
  if (options.customerType) {
    queryParams.set('CustomerType', String(options.customerType).trim());
  }

  const endpointPath = `/products/pricing/v0/items/${encodeURIComponent(cleanAsin)}/offers?${queryParams.toString()}`;

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'getItemOffers',
    });

    const payload = responseData?.payload || responseData;
    const mapped = mapAmazonOffersToPricing(payload, {
      marketplaceId,
      asin: cleanAsin,
      title: options.title || '',
      sku: options.sku || '',
    });
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : responseData?._metadata || null;

    return {
      ...mapped,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapPricingApiError(error, client, {
      marketplaceId,
      operation: 'getItemOffers',
    });
  }
};

/**
 * Get pricing and offers for a seller's listing by SKU using Product Pricing API v0
 * Strictly read-only operation. Preserves India marketplace A21TJRUUN4KGV & INR currency mapping.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {string} sku
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export const getListingOffers = async (client, sku, options = {}) => {
  if (!sku || !sku.trim()) {
    const err = new Error('Seller SKU is required to fetch listing pricing offers.');
    err.code = 'INVALID_SKU';
    err.status = 400;
    throw err;
  }

  const cleanSku = sku.trim();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';
  const itemCondition = options.itemCondition || 'New';

  const queryParams = new URLSearchParams({
    MarketplaceId: marketplaceId,
    ItemCondition: itemCondition,
  });
  if (options.customerType) {
    queryParams.set('CustomerType', String(options.customerType).trim());
  }

  const endpointPath = `/products/pricing/v0/listings/${encodeURIComponent(cleanSku)}/offers?${queryParams.toString()}`;

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'getListingOffers',
    });

    const payload = responseData?.payload || responseData;
    const mapped = mapAmazonOffersToPricing(payload, {
      marketplaceId,
      sku: cleanSku,
      asin: options.asin || payload?.ASIN || '',
      title: options.title || '',
    });
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : responseData?._metadata || null;

    return {
      ...mapped,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapPricingApiError(error, client, {
      marketplaceId,
      operation: 'getListingOffers',
    });
  }
};

/**
 * Synchronize Amazon Pricing & Buy Box snapshots for a Tenant
 * Strictly read-only: does not alter prices on Amazon or master Product.masterPrice.
 *
 * @param {Object} tenant { sellerId }
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export const syncAmazonPricingService = async (tenant, options = {}) => {
  const { sellerId, storeId = null } = tenant;
  const startedAt = new Date();

  // 1. Verify channel connection (sellerId + storeId scoped)
  let connection = null;
  try {
    const connQuery = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
    connection = await withDbTimeout(ChannelConnection.findOne(connQuery), 1000);
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

  if (!connection || connection.status !== 'CONNECTED' || !connection.credentials) {
    const err = new Error('Active Amazon channel connection is required.');
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
    recordsFailed: 0,
    errors: [],
  };

  // 2. Determine target items to fetch pricing for
  let targetItems = [];

  if (Array.isArray(options.skus) && options.skus.length > 0) {
    targetItems = options.skus.map((sku) => ({ sku }));
  } else if (Array.isArray(options.asins) && options.asins.length > 0) {
    targetItems = options.asins.map((asin) => ({ asin }));
  } else {
    // Read from existing MarketplaceListing records
    try {
      const listings = await withDbTimeout(
        MarketplaceListing.find({ sellerId, channelId: connection._id || connection.id }).limit(25),
        1500
      );
      targetItems = listings.map((l) => ({
        sku: l.externalSku,
        asin: l.asin || l.externalProductId,
        title: l.title,
      }));
    } catch (e) {
      // fallback
    }
  }

  syncStats.totalFetched = targetItems.length;

  // 3. Query pricing and store snapshots
  for (const item of targetItems) {
    try {
      let pricingData = null;

      if (item.sku) {
        try {
          pricingData = await getListingOffers(client, item.sku, {
            marketplaceId,
            asin: item.asin,
            title: item.title,
          });
        } catch (offerErr) {
          // Fallback to ASIN lookup if SKU offers fails
          if (item.asin) {
            pricingData = await getItemOffers(client, item.asin, {
              marketplaceId,
              sku: item.sku,
              title: item.title,
            });
          } else {
            throw offerErr;
          }
        }
      } else if (item.asin) {
        pricingData = await getItemOffers(client, item.asin, {
          marketplaceId,
          title: item.title,
        });
      }

      if (!pricingData) continue;

      const record = {
        ...pricingData,
        sellerId,
        channelId: connection._id || connection.id,
        marketplaceId,
      };

      const filter = {
        sellerId,
        channelId: connection._id || connection.id,
        asin: record.asin,
      };
      if (record.externalSku) {
        filter.externalSku = record.externalSku;
      }

      let existing = null;
      try {
        existing = await MarketplacePricing.findOne(filter);
        await MarketplacePricing.findOneAndUpdate(filter, record, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        });
      } catch (dbErr) {
        existing = inMemoryPricingMap.get(`${sellerId}_${record.asin}`);
        inMemoryPricingMap.set(`${sellerId}_${record.asin}`, record);
      }

      if (existing) {
        syncStats.totalUpdated++;
      } else {
        syncStats.totalCreated++;
      }
    } catch (recordErr) {
      syncStats.recordsFailed++;
      syncStats.errors.push({ item, error: recordErr.message });
    }
  }

  const completedAt = new Date();
  const finalStatus = syncStats.recordsFailed > 0 && syncStats.totalCreated + syncStats.totalUpdated === 0
    ? 'FAILED'
    : syncStats.recordsFailed > 0
    ? 'PARTIAL'
    : 'SUCCESS';

  // 4. Record SyncHistory
  try {
    await SyncHistory.create({
      sellerId,
      channelId: connection._id || connection.id,
      provider: 'AMAZON',
      syncType: 'PRICING',
      direction: 'IMPORT',
      status: finalStatus,
      startedAt,
      completedAt,
      recordsProcessed: syncStats.totalFetched,
      recordsSucceeded: syncStats.totalCreated + syncStats.totalUpdated,
      recordsFailed: syncStats.recordsFailed,
      totalFetched: syncStats.totalFetched,
      totalCreated: syncStats.totalCreated,
      totalUpdated: syncStats.totalUpdated,
    });
  } catch (e) {
    // ignore
  }

  return {
    success: finalStatus !== 'FAILED',
    status: finalStatus,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    stats: syncStats,
  };
};

/**
 * Get Amazon Pricing sync status and records count
 */
export const getAmazonPricingStatusService = async (tenant) => {
  const { sellerId } = tenant;

  let latestSync = null;
  try {
    latestSync = await SyncHistory.findOne({ sellerId, provider: 'AMAZON', syncType: 'PRICING' }).sort({ createdAt: -1 });
  } catch (e) {
    // fallback
  }

  let totalRecords = 0;
  try {
    totalRecords = await MarketplacePricing.countDocuments({ sellerId });
  } catch (e) {
    totalRecords = Array.from(inMemoryPricingMap.values()).filter(
      (p) => p.sellerId?.toString() === sellerId?.toString()
    ).length;
  }

  return {
    latestSync,
    totalRecords,
  };
};
