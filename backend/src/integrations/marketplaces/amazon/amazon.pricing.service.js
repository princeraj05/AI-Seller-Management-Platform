import { ChannelConnection } from '../../../modules/channels/channelConnection.model.js';
import { MarketplacePricing } from '../../../modules/channels/marketplacePricing.model.js';
import { MarketplaceListing } from '../../../modules/channels/marketplaceListing.model.js';
import { SyncHistory } from '../../../modules/channels/syncHistory.model.js';
import { decryptCredentials } from '../../../utils/encryption.js';
import { AmazonSpApiClient } from './amazon.client.js';
import { mapAmazonOffersToPricing } from './amazon.pricing.mapper.js';
import { inMemoryChannelsMap } from '../../../modules/channels/channel.service.js';

// In-memory fallback map for pricing testing
export const inMemoryPricingMap = new Map();

const withDbTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`DB operation timed out after ${ms}ms`)), ms)),
  ]);
};

/**
 * Get pricing and offers for an Item by ASIN using Product Pricing API v0
 * Read-only operation.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {string} asin
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export const getItemOffers = async (client, asin, options = {}) => {
  if (!asin || !asin.trim()) {
    throw new Error('ASIN is required to fetch item pricing offers.');
  }

  const cleanAsin = asin.trim().toUpperCase();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';
  const itemCondition = options.itemCondition || 'New';

  const queryParams = new URLSearchParams({
    MarketplaceId: marketplaceId,
    ItemCondition: itemCondition,
  });

  const endpointPath = `/products/pricing/v0/items/${encodeURIComponent(cleanAsin)}/offers?${queryParams.toString()}`;
  const responseData = await client.executeRequest(endpointPath);

  const payload = responseData.payload || responseData;
  return mapAmazonOffersToPricing(payload, {
    marketplaceId,
    asin: cleanAsin,
    title: options.title || '',
    sku: options.sku || '',
  });
};

/**
 * Get pricing and offers for a seller's listing by SKU using Product Pricing API v0
 * Read-only operation.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {string} sku
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export const getListingOffers = async (client, sku, options = {}) => {
  if (!sku || !sku.trim()) {
    throw new Error('Seller SKU is required to fetch listing pricing offers.');
  }

  const cleanSku = sku.trim();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';
  const itemCondition = options.itemCondition || 'New';

  const queryParams = new URLSearchParams({
    MarketplaceId: marketplaceId,
    ItemCondition: itemCondition,
  });

  const endpointPath = `/products/pricing/v0/listings/${encodeURIComponent(cleanSku)}/offers?${queryParams.toString()}`;
  const responseData = await client.executeRequest(endpointPath);

  const payload = responseData.payload || responseData;
  return mapAmazonOffersToPricing(payload, {
    marketplaceId,
    sku: cleanSku,
    asin: options.asin || payload.ASIN || '',
    title: options.title || '',
  });
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
  const { sellerId } = tenant;
  const startedAt = new Date();

  // 1. Verify channel connection
  let connection = null;
  try {
    connection = await withDbTimeout(ChannelConnection.findOne({ sellerId, provider: 'AMAZON' }), 1000);
  } catch (e) {
    // fallback
  }

  if (!connection) {
    connection = Array.from(inMemoryChannelsMap.values()).find(
      (c) => c.sellerId?.toString() === sellerId?.toString() && c.provider === 'AMAZON'
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
