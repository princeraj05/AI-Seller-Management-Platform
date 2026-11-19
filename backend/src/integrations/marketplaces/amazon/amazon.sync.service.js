import { ChannelConnection } from '../../../modules/channels/channelConnection.model.js';
import { MarketplaceListing } from '../../../modules/channels/marketplaceListing.model.js';
import { SyncHistory } from '../../../modules/channels/syncHistory.model.js';
import { Product } from '../../../modules/products/product.model.js';
import { decryptCredentials } from '../../../utils/encryption.js';
import { AmazonSpApiClient } from './amazon.client.js';
import { searchListingsItems, getListingsItem } from './amazon.listings.service.js';
import { getCatalogItem } from './amazon.catalog.service.js';
import { mapListingToDbPayload } from './amazon.product.mapper.js';
import { inMemoryChannelsMap, inMemoryListingsMap, inMemorySyncHistoryMap } from '../../../modules/channels/channel.service.js';

const withDbTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`DB operation timed out after ${ms}ms`)), ms)),
  ]);
};

/**
 * Execute Amazon Catalog and Seller Listings Synchronization for a Tenant
 * Strictly read-only: does not modify or push changes to Amazon.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {Object} [options]
 * @param {string} [options.marketplaceId]
 * @param {string[]} [options.skus] Optional specific SKUs to sync
 * @returns {Promise<Object>} Sync outcome summary
 */
export const syncAmazonSellerListingsService = async (tenant, options = {}) => {
  const { sellerId } = tenant;
  const startedAt = new Date();

  // 1. Verify Amazon connection exists for tenant
  let connection = null;
  try {
    connection = await withDbTimeout(ChannelConnection.findOne({ sellerId, provider: 'AMAZON' }), 1000);
  } catch (err) {
    // Database buffering or offline: fallback to memory map
  }

  if (!connection) {
    connection = Array.from(inMemoryChannelsMap.values()).find(
      (c) => c.sellerId?.toString() === sellerId?.toString() && c.provider === 'AMAZON'
    );
  }

  if (!connection) {
    const err = new Error('Amazon channel connection not found. Please connect your Amazon Seller account first.');
    err.code = 'CHANNEL_NOT_FOUND';
    throw err;
  }

  if (connection.status !== 'CONNECTED') {
    const err = new Error(`Amazon channel is not active (current status: ${connection.status}). Please reconnect or reauthorize.`);
    err.code = 'CHANNEL_NOT_CONNECTED';
    throw err;
  }

  if (!connection.credentials) {
    const err = new Error('Amazon channel credentials missing. Reauthorization required.');
    err.code = 'MISSING_CREDENTIALS';
    throw err;
  }

  // 2. Decrypt credentials safely inside backend
  const decrypted = decryptCredentials(connection.credentials);
  if (!decrypted || !decrypted.refreshToken) {
    const err = new Error('Failed to decrypt Amazon credentials. Please reconnect the channel.');
    err.code = 'DECRYPTION_ERROR';
    throw err;
  }

  const sellingPartnerId = connection.sellingPartnerId || connection.externalAccountId || decrypted.sellingPartnerId;
  const marketplaceId = options.marketplaceId || connection.marketplaceId || 'A21TJRUUN4KGV';
  const region = connection.marketplaceRegion || 'eu';

  // 3. Create SyncHistory tracking record
  const syncHistoryData = {
    sellerId,
    channelId: connection._id || connection.id,
    provider: 'AMAZON',
    syncType: 'AMAZON_LISTINGS',
    direction: 'IMPORT',
    status: 'RUNNING',
    startedAt,
    recordsProcessed: 0,
    recordsSucceeded: 0,
    recordsFailed: 0,
    totalFetched: 0,
    totalCreated: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    metadata: {
      marketplaceId,
      region,
      sellingPartnerId,
    },
  };

  let syncLog = null;
  try {
    syncLog = await SyncHistory.create(syncHistoryData);
  } catch (err) {
    const id = `sync-${Date.now()}`;
    syncLog = { _id: id, id, ...syncHistoryData };
    inMemorySyncHistoryMap.set(id, syncLog);
  }

  // 4. Initialize Amazon SP-API Client
  const client = new AmazonSpApiClient({
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
    syncedListings: [],
  };

  try {
    // 5. Gather target SKUs to synchronize:
    // A) Options SKUs if specifically requested
    // B) Query listings from Amazon SP-API
    // C) Existing master products or listings
    let listingsToProcess = [];

    if (Array.isArray(options.skus) && options.skus.length > 0) {
      for (const sku of options.skus) {
        try {
          const item = await getListingsItem(client, sellingPartnerId, sku, { marketplaceId });
          if (item) listingsToProcess.push(item);
        } catch (itemErr) {
          syncStats.errors.push({ sku, error: itemErr.message });
          syncStats.recordsFailed++;
        }
      }
    } else {
      // Query Amazon Listings Search endpoint
      try {
        const searchResult = await searchListingsItems(client, sellingPartnerId, {
          marketplaceId,
          pageSize: 20,
        });
        if (Array.isArray(searchResult.items)) {
          listingsToProcess.push(...searchResult.items);
        }
      } catch (searchErr) {
        // In sandbox or when bulk endpoint is not provisioned, log note
        console.warn('Amazon searchListingsItems returned:', searchErr.message);
      }

      // If search endpoint returned empty, check existing DB listings or master product SKUs to sync live
      if (listingsToProcess.length === 0) {
        let existingListings = [];
        try {
          existingListings = await MarketplaceListing.find({ sellerId, channelId: connection._id || connection.id });
        } catch (e) {
          existingListings = Array.from(inMemoryListingsMap.values()).filter(
            (l) => l.sellerId?.toString() === sellerId?.toString()
          );
        }

        // Try syncing up to 10 known SKUs
        for (const existing of existingListings.slice(0, 10)) {
          if (existing.externalSku) {
            try {
              const item = await getListingsItem(client, sellingPartnerId, existing.externalSku, { marketplaceId });
              if (item) listingsToProcess.push(item);
            } catch (skuErr) {
              // Ignore individual missing item
            }
          }
        }
      }
    }

    syncStats.totalFetched = listingsToProcess.length;

    // 6. Match listings with internal Master Products and persist safely
    for (const listing of listingsToProcess) {
      try {
        if (!listing.sku) {
          syncStats.totalSkipped++;
          continue;
        }

        // Check if internal product exists by SKU (case-insensitive)
        let internalProduct = null;
        try {
          internalProduct = await Product.findOne({
            sellerId,
            sku: { $regex: new RegExp(`^${listing.sku}$`, 'i') },
          });
        } catch (pErr) {
          console.warn('Product lookup failed:', pErr.message);
        }

        const internalProductId = internalProduct ? (internalProduct._id || internalProduct.id) : null;

        // Optionally fetch extra catalog details if title or image missing
        if ((!listing.title || !listing.imageUrl) && listing.asin) {
          try {
            const catItem = await getCatalogItem(client, listing.asin, { marketplaceId });
            if (catItem) {
              if (!listing.title && catItem.title) listing.title = catItem.title;
              if (!listing.imageUrl && catItem.mainImageUrl) listing.imageUrl = catItem.mainImageUrl;
            }
          } catch (catErr) {
            // Ignore optional catalog enrichment error
          }
        }

        // Prepare database payload
        const dbPayload = mapListingToDbPayload(listing, {
          sellerId,
          channelId: connection._id || connection.id,
          internalProductId,
        });

        // 7. Upsert idempotently into MarketplaceListing
        let listingDoc = null;
        try {
          const filter = {
            sellerId,
            channelId: connection._id || connection.id,
            externalSku: listing.sku,
          };
          const existingDoc = await MarketplaceListing.findOne(filter);

          listingDoc = await MarketplaceListing.findOneAndUpdate(filter, dbPayload, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          });

          if (existingDoc) {
            syncStats.totalUpdated++;
          } else {
            syncStats.totalCreated++;
          }
        } catch (dbErr) {
          // Memory fallback
          const id = `list-${listing.sku}`;
          listingDoc = { _id: id, id, ...dbPayload };
          inMemoryListingsMap.set(id, listingDoc);
          syncStats.totalCreated++;
        }

        syncStats.syncedListings.push({
          sku: listing.sku,
          asin: listing.asin,
          title: listing.title,
          status: listing.status,
          price: listing.price,
          linkedToProduct: Boolean(internalProductId),
        });
      } catch (recordErr) {
        syncStats.recordsFailed++;
        syncStats.errors.push({ sku: listing.sku, error: recordErr.message });
      }
    }

    const completedAt = new Date();
    const finalStatus = syncStats.recordsFailed > 0 && syncStats.totalCreated + syncStats.totalUpdated === 0
      ? 'FAILED'
      : syncStats.recordsFailed > 0
      ? 'PARTIAL'
      : 'SUCCESS';

    // 8. Update SyncHistory log
    if (syncLog) {
      syncLog.status = finalStatus;
      syncLog.completedAt = completedAt;
      syncLog.recordsProcessed = syncStats.totalFetched;
      syncLog.recordsSucceeded = syncStats.totalCreated + syncStats.totalUpdated;
      syncLog.recordsFailed = syncStats.recordsFailed;
      syncLog.totalFetched = syncStats.totalFetched;
      syncLog.totalCreated = syncStats.totalCreated;
      syncLog.totalUpdated = syncStats.totalUpdated;
      syncLog.totalSkipped = syncStats.totalSkipped;
      syncLog.metadata = {
        ...syncLog.metadata,
        errors: syncStats.errors,
      };

      try {
        if (typeof syncLog.save === 'function') await syncLog.save();
      } catch (e) {
        // ignore
      }
    }

    // 9. Update ChannelConnection last sync timestamps
    if (connection) {
      connection.lastSyncAt = completedAt;
      if (finalStatus !== 'FAILED') {
        connection.lastSuccessfulSyncAt = completedAt;
      }
      try {
        if (typeof connection.save === 'function') await connection.save();
      } catch (e) {
        // ignore
      }
    }

    return {
      success: finalStatus !== 'FAILED',
      status: finalStatus,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      stats: syncStats,
      marketplaceId,
    };
  } catch (error) {
    const completedAt = new Date();
    if (syncLog) {
      syncLog.status = 'FAILED';
      syncLog.completedAt = completedAt;
      syncLog.error = error.message;
      try {
        if (typeof syncLog.save === 'function') await syncLog.save();
      } catch (e) {
        // ignore
      }
    }

    if (connection) {
      connection.lastSyncAt = completedAt;
      connection.lastError = error.message;
      try {
        if (typeof connection.save === 'function') await connection.save();
      } catch (e) {
        // ignore
      }
    }

    throw error;
  }
};

/**
 * Get latest sync status and history for Amazon integration
 *
 * @param {Object} tenant { sellerId }
 * @returns {Promise<Object>}
 */
export const getAmazonSyncStatusService = async (tenant) => {
  const { sellerId } = tenant;

  let latestSync = null;
  let recentHistory = [];

  try {
    recentHistory = await SyncHistory.find({ sellerId, provider: 'AMAZON' })
      .sort({ createdAt: -1 })
      .limit(5);
    latestSync = recentHistory[0] || null;
  } catch (err) {
    const memHistory = Array.from(inMemorySyncHistoryMap.values())
      .filter((s) => s.sellerId?.toString() === sellerId?.toString() && s.provider === 'AMAZON')
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    recentHistory = memHistory.slice(0, 5);
    latestSync = recentHistory[0] || null;
  }

  // Count current synchronized Amazon listings
  let totalListings = 0;
  try {
    totalListings = await MarketplaceListing.countDocuments({ sellerId, provider: 'AMAZON' });
  } catch (err) {
    totalListings = Array.from(inMemoryListingsMap.values()).filter(
      (l) => l.sellerId?.toString() === sellerId?.toString() && l.provider === 'AMAZON'
    ).length;
  }

  return {
    latestSync,
    recentHistory,
    totalListings,
  };
};
