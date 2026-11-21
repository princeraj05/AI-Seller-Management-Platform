import { ChannelConnection } from '../../../modules/channels/channelConnection.model.js';
import { SyncHistory } from '../../../modules/channels/syncHistory.model.js';
import { Order } from '../../../modules/orders/order.model.js';
import { Product } from '../../../modules/products/product.model.js';
import { Return } from '../../../modules/returns/return.model.js';
import { inMemoryOrdersMap } from '../../../modules/orders/order.service.js';
import {
  inMemoryChannelsMap,
  buildTenantConnectionQuery,
  matchesTenantStore,
} from '../../../modules/channels/channel.service.js';
import { isProductionEnv } from '../../../config/storage.js';
import { inMemoryReturnsMap } from '../../../modules/returns/return.service.js';
import { decryptCredentials } from '../../../utils/encryption.js';
import { AmazonSpApiClient, AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';
import {
  mapAmazonOrderStatus,
  mapFulfillmentChannel,
  mapAmazonOrderItems,
  mapAmazonOrderToDbPayload,
  mapAmazonFinancialEventsToRefunds,
} from './amazon.order.mapper.js';
import { mapAmazonOrderToMaster } from './amazon.mapper.js';
import {
  acquireDistributedLock,
  releaseDistributedLock,
  isDistributedLockActive,
  createLockHeartbeat,
} from '../../../modules/channels/distributedLock.service.js';

const withDbTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`DB operation timed out after ${ms}ms`)), ms)),
  ]);
};

export const ORDERS_V2026_FULFILLMENT_STATUSES = Object.freeze([
  'PENDING_AVAILABILITY',
  'PENDING',
  'UNSHIPPED',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'CANCELLED',
  'UNFULFILLABLE',
]);

export const ORDERS_V2026_FULFILLED_BY = Object.freeze(['MERCHANT', 'AMAZON']);

export const ORDERS_V2026_INCLUDED_DATA = Object.freeze([
  'BUYER',
  'RECIPIENT',
  'PROCEEDS',
  'EXPENSE',
  'PROMOTION',
  'CANCELLATION',
  'FULFILLMENT',
  'PACKAGES',
  'TAX',
  'PAYMENT',
  'FULFILLMENT_ORDERS',
]);

const normalizeFulfilledByValue = (raw) => {
  const val = String(raw || '').trim().toUpperCase();
  if (!val) return null;
  if (val === 'AMAZON' || val === 'AFN' || val === 'FBA') return 'AMAZON';
  if (val === 'MERCHANT' || val === 'MFN' || val === 'FBM') return 'MERCHANT';
  return val;
};

const wrapOrdersApiError = (error, client, { marketplaceId, operation }) => {
  const diagnostics =
    error.diagnostics ||
    (typeof client?.getLastRequestDiagnostics === 'function'
      ? client.getLastRequestDiagnostics()
      : null);
  const amazonFirstError = Array.isArray(error.sanitizedData?.errors)
    ? error.sanitizedData.errors[0]
    : null;
  const amazonErrorCode = amazonFirstError?.code || error.code || 'API_ERROR';
  const amazonErrorMessage = amazonFirstError?.message || error.message || 'Amazon Orders API request failed.';
  const amazonErrorDetails = amazonFirstError?.details || '';

  const wrapped = new Error(amazonErrorMessage);
  wrapped.status = error.status || 500;
  wrapped.code =
    error.status === 401
      ? 'LWA_UNAUTHORIZED'
      : error.status === 403
      ? 'SP_API_FORBIDDEN'
      : error.status === 429
      ? 'RATE_LIMITED'
      : error.code || amazonErrorCode || 'ORDERS_API_ERROR';
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
 * Search Amazon Orders using official Orders API v2026-01-01 (searchOrders)
 * Strictly read-only operation.
 *
 * Official v2026-01-01 Query Parameters (models/orders-api-model/orders_2026-01-01.json):
 * - marketplaceIds: Comma-separated marketplace IDs (default India A21TJRUUN4KGV)
 * - createdAfter / createdBefore OR lastUpdatedAfter / lastUpdatedBefore (mutually exclusive ISO 8601)
 * - fulfillmentStatuses: Official FulfillmentStatus enum values (also accepts legacy alias options.orderStatuses)
 * - fulfilledBy: Official enum ['MERCHANT', 'AMAZON'] (maps legacy AFN/MFN/FBA/FBM aliases)
 * - includedData: Official dataset enums (PII datasets BUYER/RECIPIENT never auto-included)
 * - maxResultsPerPage: Integer 1..100 (also accepts legacy alias options.pageSize)
 * - paginationToken: Next page cursor token (also accepts legacy aliases options.pageToken / options.nextToken)
 *
 * Never silently swallows HTTP 400/404 errors; throws structured secret-safe diagnostics.
 *
 * @param {AmazonSpApiClient} client
 * @param {Object} [options]
 * @returns {Promise<{ orders: Array, pagination: Object, marketplaceId: string, diagnostics: Object|null, executionOutcome: string }>}
 */
export const searchAmazonOrders = async (client, options = {}) => {
  const marketplaceId = String(
    options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV'
  ).trim();

  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
  });

  // Official spec: createdAfter/createdBefore and lastUpdatedAfter/lastUpdatedBefore are mutually exclusive
  if (options.lastUpdatedAfter) {
    queryParams.set('lastUpdatedAfter', new Date(options.lastUpdatedAfter).toISOString());
    if (options.lastUpdatedBefore) {
      queryParams.set('lastUpdatedBefore', new Date(options.lastUpdatedBefore).toISOString());
    }
  } else if (options.createdAfter) {
    queryParams.set('createdAfter', new Date(options.createdAfter).toISOString());
    if (options.createdBefore) {
      queryParams.set('createdBefore', new Date(options.createdBefore).toISOString());
    }
  }

  // Official v2026-01-01 parameter: fulfillmentStatuses (supports legacy options.orderStatuses alias)
  const rawStatuses = options.fulfillmentStatuses ?? options.orderStatuses;
  if (rawStatuses !== undefined && rawStatuses !== null && rawStatuses !== '') {
    const list = (Array.isArray(rawStatuses) ? rawStatuses : String(rawStatuses).split(','))
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean);
    const invalid = list.filter((s) => !ORDERS_V2026_FULFILLMENT_STATUSES.includes(s));
    if (invalid.length > 0) {
      const err = new Error(
        `Invalid fulfillmentStatuses value(s) for Orders API v2026-01-01: ${invalid.join(', ')}.`
      );
      err.code = 'INVALID_FULFILLMENT_STATUS';
      err.status = 400;
      throw err;
    }
    if (list.length > 0) {
      queryParams.set('fulfillmentStatuses', Array.from(new Set(list)).join(','));
    }
  }

  // Official v2026-01-01 parameter: fulfilledBy ('MERCHANT' | 'AMAZON'); maps legacy AFN/MFN/FBA/FBM aliases
  const rawFulfilledBy = options.fulfilledBy ?? options.fulfillmentChannels;
  if (rawFulfilledBy !== undefined && rawFulfilledBy !== null && rawFulfilledBy !== '') {
    const list = (Array.isArray(rawFulfilledBy) ? rawFulfilledBy : String(rawFulfilledBy).split(','))
      .map(normalizeFulfilledByValue)
      .filter(Boolean);
    const invalid = list.filter((v) => !ORDERS_V2026_FULFILLED_BY.includes(v));
    if (invalid.length > 0) {
      const err = new Error(
        `Invalid fulfilledBy value(s) for Orders API v2026-01-01: ${invalid.join(', ')}. Expected MERCHANT or AMAZON.`
      );
      err.code = 'INVALID_FULFILLED_BY';
      err.status = 400;
      throw err;
    }
    if (list.length > 0) {
      queryParams.set('fulfilledBy', Array.from(new Set(list)).join(','));
    }
  }

  // Official v2026-01-01 parameter: includedData
  if (options.includedData) {
    const incList = (Array.isArray(options.includedData)
      ? options.includedData
      : String(options.includedData).split(',')
    )
      .map((d) => String(d || '').trim().toUpperCase())
      .filter((d) => ORDERS_V2026_INCLUDED_DATA.includes(d));
    if (incList.length > 0) {
      queryParams.set('includedData', Array.from(new Set(incList)).join(','));
    }
  }

  // Official v2026-01-01 parameter: maxResultsPerPage (integer 1..100; supports legacy options.pageSize alias)
  const rawMax = options.maxResultsPerPage ?? options.pageSize;
  let maxResultsPerPage = 50;
  if (rawMax !== undefined && rawMax !== null && rawMax !== '') {
    const parsedMax = Number(rawMax);
    if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 100) {
      const err = new Error(
        'Orders API v2026-01-01 maxResultsPerPage must be an integer between 1 and 100.'
      );
      err.code = 'INVALID_MAX_RESULTS_PER_PAGE';
      err.status = 400;
      throw err;
    }
    maxResultsPerPage = parsedMax;
  }
  queryParams.set('maxResultsPerPage', String(maxResultsPerPage));

  // Official v2026-01-01 parameter: paginationToken (supports legacy options.pageToken / nextToken aliases)
  const rawPaginationToken = options.paginationToken || options.pageToken || options.nextToken;
  if (rawPaginationToken && String(rawPaginationToken).trim()) {
    queryParams.set('paginationToken', String(rawPaginationToken).trim());
  }

  const endpointPath = `/orders/2026-01-01/orders?${queryParams.toString()}`;

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'searchOrders',
    });
    const orders = responseData?.orders || responseData?.payload?.Orders || responseData?.payload?.orders || [];
    const nextToken =
      responseData?.pagination?.nextToken ||
      responseData?.pagination?.pageToken ||
      responseData?.nextToken ||
      null;
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : responseData?._metadata || null;

    return {
      orders,
      pagination: {
        nextToken,
        paginationToken: nextToken,
        pageToken: nextToken,
      },
      marketplaceId,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapOrdersApiError(error, client, {
      marketplaceId,
      operation: 'searchOrders',
    });
  }
};

/**
 * Get Amazon Order details by orderId using Orders API v2026-01-01 (getOrder)
 * Strictly read-only operation.
 *
 * @param {AmazonSpApiClient} client
 * @param {string} orderId
 * @param {Object} [options]
 * @param {string|string[]} [options.includedData]
 * @returns {Promise<Object|null>}
 */
export const getAmazonOrder = async (client, orderId, options = {}) => {
  const cleanId = String(orderId || '').trim();
  if (!cleanId) {
    const err = new Error('orderId is required for Amazon Orders API getOrder.');
    err.code = 'INVALID_ORDER_ID';
    err.status = 400;
    throw err;
  }

  const queryParams = new URLSearchParams();
  if (options.includedData) {
    const incList = (Array.isArray(options.includedData)
      ? options.includedData
      : String(options.includedData).split(',')
    )
      .map((d) => String(d || '').trim().toUpperCase())
      .filter((d) => ORDERS_V2026_INCLUDED_DATA.includes(d));
    if (incList.length > 0) {
      queryParams.set('includedData', Array.from(new Set(incList)).join(','));
    }
  }

  const qs = queryParams.toString();
  const endpointPath = `/orders/2026-01-01/orders/${encodeURIComponent(cleanId)}${qs ? `?${qs}` : ''}`;

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'getOrder',
    });
    return responseData?.order || responseData?.payload || responseData;
  } catch (error) {
    throw wrapOrdersApiError(error, client, {
      marketplaceId: client?.credentials?.marketplaceId || 'A21TJRUUN4KGV',
      operation: 'getOrder',
    });
  }
};

/**
 * Retrieve Line Items for an Amazon Order using Orders API v2026-01-01.
 * Note: Orders API v2026-01-01 does NOT have an /orderItems endpoint.
 * Order items are retrieved from the order object directly via getOrder.
 *
 * @param {AmazonSpApiClient} client
 * @param {string} orderId
 * @param {Object} [options]
 * @returns {Promise<{ orderItems: Array, pagination: Object }>}
 */
export const getAmazonOrderItems = async (client, orderId, options = {}) => {
  const fullOrder = await getAmazonOrder(client, orderId, options);
  const items = fullOrder?.orderItems || fullOrder?.OrderItems || [];
  return {
    orderItems: items,
    pagination: { pageToken: null, nextToken: null },
  };
};

/**
 * Synchronize Amazon Orders for a Tenant
 * Strictly read-only: does NOT modify orders on Amazon, does NOT deduct master stock.
 * Excludes all Buyer PII and avoids fabricated placeholder addresses.
 * Protected by a durable atomic distributed lock scoped to sellerId and channelId.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {Object} [options]
 * @param {string} [options.marketplaceId]
 * @param {string} [options.createdAfter]
 * @param {string} [options.lastUpdatedAfter]
 * @param {string|string[]} [options.orderStatuses]
 * @param {string|string[]} [options.fulfillmentChannels]
 * @param {number} [options.maxPages=5]
 * @returns {Promise<Object>} Sync outcome summary
 */
export const syncAmazonOrdersService = async (tenant, options = {}) => {
  const { sellerId, storeId = null } = tenant;

  // 1. Verify channel connection first to obtain channelId for lock scoping
  let connection = null;
  try {
    const connQuery = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
    connection = await withDbTimeout(ChannelConnection.findOne(connQuery), 1000);
  } catch (err) {
    if (isProductionEnv()) {
      const dbErr = new Error('Service Unavailable: Unable to verify Amazon connection in MongoDB.');
      dbErr.code = 'SERVICE_UNAVAILABLE';
      dbErr.status = 503;
      throw dbErr;
    }
    // DB offline fallback in non-production only
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

  if (connection.status !== 'CONNECTED') {
    const err = new Error(`Amazon channel is not active (current status: ${connection.status}). Please reconnect.`);
    err.code = 'CHANNEL_NOT_CONNECTED';
    throw err;
  }

  if (!connection.credentials) {
    const err = new Error('Amazon channel credentials missing. Reauthorization required.');
    err.code = 'MISSING_CREDENTIALS';
    throw err;
  }

  const channelId = connection._id || connection.id || 'DEFAULT_CHANNEL';

  // 2. Concurrency Control: Acquire Durable Distributed Lock scoped to sellerId and channelId
  const lockHandle = await acquireDistributedLock({
    sellerId,
    channelId,
    resource: 'AMAZON_ORDER_SYNC',
    leaseMs: 5 * 60 * 1000, // 5 minutes lease
  });

  // Start background heartbeat to renew lease for long-running sync jobs
  const heartbeat = createLockHeartbeat(lockHandle, 5 * 60 * 1000);

  const startedAt = new Date();

  try {
    // 3. Decrypt credentials safely inside backend
    const decrypted = decryptCredentials(connection.credentials);
    if (!decrypted || !decrypted.refreshToken) {
      const err = new Error('Failed to decrypt Amazon credentials. Please reconnect the channel.');
      err.code = 'DECRYPTION_ERROR';
      throw err;
    }

    const marketplaceId = options.marketplaceId || connection.marketplaceId || 'A21TJRUUN4KGV';
    const region = connection.marketplaceRegion || 'eu';

    // 4. Initialize tenant-scoped SP-API client
    const client = new AmazonSpApiClient({
      sellerId: sellerId ? sellerId.toString() : null,
      refreshToken: decrypted.refreshToken,
      region,
      marketplaceId,
    });

    // 5. Determine incremental sync filter (lastUpdatedAfter)
    let syncFilterDate = options.lastUpdatedAfter || options.createdAfter || null;
    if (!syncFilterDate) {
      try {
        const lastSync = await withDbTimeout(
          SyncHistory.findOne({
            sellerId,
            provider: 'AMAZON',
            syncType: 'ORDER',
            status: 'SUCCESS',
          }).sort({ completedAt: -1 }),
          1000
        );
        if (lastSync?.startedAt) {
          // 5-minute safety overlap buffer
          syncFilterDate = new Date(new Date(lastSync.startedAt).getTime() - 5 * 60 * 1000).toISOString();
        }
      } catch (err) {
        // DB timeout or fallback
      }
    }

    if (!syncFilterDate) {
      // Default: 30 days initial sync window
      syncFilterDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    // 6. Create SyncHistory tracking record
    const syncHistoryData = {
      sellerId,
      channelId,
      provider: 'AMAZON',
      syncType: 'ORDER',
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
        filterDate: syncFilterDate,
        apiVersion: '2026-01-01',
      },
    };

    let syncLog = null;
    try {
      syncLog = await SyncHistory.create(syncHistoryData);
    } catch (err) {
      const id = `sync-order-${Date.now()}`;
      syncLog = { _id: id, id, ...syncHistoryData };
    }

    const syncStats = {
      totalFetched: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      errors: [],
      syncedOrders: [],
    };

    // 7. Fetch orders with pagination using Orders API v2026-01-01 searchOrders (with repeated-token loop guard)
    let currentPaginationToken = null;
    const seenPaginationTokens = new Set();
    let pageCount = 0;
    const maxPages = options.maxPages || 5;
    const fetchedOrders = [];

    do {
      pageCount++;
      const searchRes = await searchAmazonOrders(client, {
        marketplaceId,
        lastUpdatedAfter: syncFilterDate,
        fulfillmentStatuses: options.fulfillmentStatuses ?? options.orderStatuses,
        fulfilledBy: options.fulfilledBy ?? options.fulfillmentChannels,
        maxResultsPerPage: options.maxResultsPerPage ?? 50,
        paginationToken: currentPaginationToken,
      });

      const pageOrders = searchRes.orders || [];
      fetchedOrders.push(...pageOrders);

      const nextToken = searchRes.pagination?.nextToken || searchRes.pagination?.paginationToken || null;
      if (nextToken && seenPaginationTokens.has(nextToken)) {
        break;
      }
      if (nextToken) {
        seenPaginationTokens.add(nextToken);
      }
      currentPaginationToken = nextToken;
    } while (currentPaginationToken && pageCount < maxPages);

    syncStats.totalFetched = fetchedOrders.length;

    // 8. Process each order
    for (const rawOrder of fetchedOrders) {
      if (heartbeat.hasLostOwnership()) {
        const lostErr = new Error('Distributed lock ownership lost during order synchronization. Aborting sync.');
        lostErr.code = 'LOCK_OWNERSHIP_LOST';
        lostErr.status = 409;
        throw lostErr;
      }

      syncStats.recordsProcessed++;
      const externalOrderId = rawOrder.orderId || rawOrder.AmazonOrderId;

      if (!externalOrderId) {
        syncStats.totalSkipped++;
        continue;
      }

      try {
        // Retrieve order items directly from v2026-01-01 order object
        let lineItems = rawOrder.orderItems || rawOrder.OrderItems || [];
        if (!Array.isArray(lineItems) || lineItems.length === 0) {
          try {
            // Consolidated getOrder (v2026-01-01), never calls deprecated /orderItems
            const fullOrder = await getAmazonOrder(client, externalOrderId);
            lineItems = fullOrder?.orderItems || fullOrder?.OrderItems || [];
          } catch (itemErr) {
            console.warn(`Could not fetch order items for ${externalOrderId}:`, itemErr.message);
            lineItems = [];
          }
        }

        // Map Product SKUs to master products
        const skus = Array.from(
          new Set(
            lineItems
              .map((it) => {
                const p = it.product || {};
                return (p.sellerSku || it.sellerSku || it.SellerSKU || it.sku || '').trim().toUpperCase();
              })
              .filter(Boolean)
          )
        );

        let matchingProducts = [];
        if (skus.length > 0) {
          try {
            matchingProducts = await withDbTimeout(
              Product.find({ sellerId, sku: { $in: skus } }),
              1500
            );
          } catch (err) {
            // DB fallback
          }
        }

        const productSkuMap = new Map();
        matchingProducts.forEach((p) => {
          if (p.sku) productSkuMap.set(p.sku.toUpperCase(), p);
        });

        // Map Amazon order to platform Order payload (strict PII exclusion, no fabricated addresses)
        const orderPayload = mapAmazonOrderToDbPayload(rawOrder, {
          sellerId,
          channelId,
          marketplaceId,
          productSkuMap,
          orderItems: lineItems,
        });

        // 9. Idempotent Upsert into Order collection
        let savedOrder = null;
        try {
          const existing = await withDbTimeout(
            Order.findOne({
              sellerId,
              channel: 'AMAZON',
              externalOrderId: orderPayload.externalOrderId,
            }),
            1500
          );

          if (existing) {
            existing.status = orderPayload.status;
            existing.originalAmazonStatus = orderPayload.originalAmazonStatus;
            existing.fulfillmentStatus = orderPayload.fulfillmentStatus;
            existing.fulfillmentChannel = orderPayload.fulfillmentChannel;
            existing.items = orderPayload.items;
            existing.shippingAddress = orderPayload.shippingAddress;
            existing.billingAddress = orderPayload.billingAddress;
            existing.totalAmount = orderPayload.totalAmount;
            existing.subtotal = orderPayload.subtotal;
            existing.lastUpdateDate = orderPayload.lastUpdateDate;
            existing.lastSyncedAt = new Date();
            existing.sourceMetadata = { ...existing.sourceMetadata, ...orderPayload.sourceMetadata };
            savedOrder = await existing.save();
            syncStats.totalUpdated++;
          } else {
            savedOrder = await Order.create(orderPayload);
            syncStats.totalCreated++;
          }
        } catch (dbErr) {
          // In-memory fallback
          let existingMem = Array.from(inMemoryOrdersMap.values()).find(
            (o) =>
              o.sellerId?.toString() === sellerId?.toString() &&
              o.channel === 'AMAZON' &&
              o.externalOrderId === orderPayload.externalOrderId
          );

          if (existingMem) {
            Object.assign(existingMem, orderPayload, { lastSyncedAt: new Date() });
            savedOrder = existingMem;
            syncStats.totalUpdated++;
          } else {
            const memId = `ord-mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            savedOrder = {
              _id: memId,
              id: memId,
              ...orderPayload,
              save: async function () {
                inMemoryOrdersMap.set(memId, this);
                return this;
              },
            };
            inMemoryOrdersMap.set(memId, savedOrder);
            syncStats.totalCreated++;
          }
        }

        syncStats.recordsSucceeded++;
        syncStats.syncedOrders.push({
          orderId: orderPayload.externalOrderId,
          status: orderPayload.status,
          originalAmazonStatus: orderPayload.originalAmazonStatus,
          fulfillmentChannel: orderPayload.fulfillmentChannel,
          totalAmount: orderPayload.totalAmount,
          itemCount: orderPayload.items.length,
        });
      } catch (orderError) {
        syncStats.recordsFailed++;
        syncStats.errors.push({
          externalOrderId,
          error: orderError.message,
        });
      }
    }

    // 10. Update SyncHistory and Connection lastSyncAt
    const completedAt = new Date();
    const finalStatus =
      syncStats.recordsFailed === 0
        ? 'SUCCESS'
        : syncStats.recordsSucceeded > 0
        ? 'PARTIAL'
        : 'FAILED';

    try {
      if (syncLog && syncLog.save) {
        syncLog.status = finalStatus;
        syncLog.completedAt = completedAt;
        syncLog.recordsProcessed = syncStats.recordsProcessed;
        syncLog.recordsSucceeded = syncStats.recordsSucceeded;
        syncLog.recordsFailed = syncStats.recordsFailed;
        syncLog.totalFetched = syncStats.totalFetched;
        syncLog.totalCreated = syncStats.totalCreated;
        syncLog.totalUpdated = syncStats.totalUpdated;
        syncLog.totalSkipped = syncStats.totalSkipped;
        if (syncStats.errors.length > 0) {
          syncLog.error = syncStats.errors.map((e) => `${e.externalOrderId}: ${e.error}`).join('; ');
        }
        await withDbTimeout(syncLog.save(), 1000);
      }
    } catch (e) {
      // Sync log save error ignored
    }

    try {
      if (connection && connection.save) {
        connection.lastSyncAt = completedAt;
        await withDbTimeout(connection.save(), 1000);
      }
    } catch (e) {
      // Connection save error ignored
    }

    return {
      success: finalStatus !== 'FAILED',
      status: finalStatus,
      durationMs: completedAt - startedAt,
      summary: {
        totalFetched: syncStats.totalFetched,
        totalCreated: syncStats.totalCreated,
        totalUpdated: syncStats.totalUpdated,
        totalSkipped: syncStats.totalSkipped,
        recordsSucceeded: syncStats.recordsSucceeded,
        recordsFailed: syncStats.recordsFailed,
      },
      orders: syncStats.syncedOrders,
      errors: syncStats.errors,
      syncFilterDate,
    };
  } finally {
    // 11. Stop heartbeat timer and release distributed lock safely
    heartbeat.stop();
    await releaseDistributedLock(lockHandle);
  }
};

/**
 * Retrieve Amazon Orders Status and Telemetry for a Tenant
 *
 * @param {Object} tenant { sellerId }
 * @returns {Promise<Object>}
 */
export const getAmazonOrdersStatusService = async (tenant) => {
  const { sellerId } = tenant;

  let connection = null;
  try {
    connection = await withDbTimeout(ChannelConnection.findOne({ sellerId, provider: 'AMAZON' }), 1000);
  } catch (err) {
    // fallback
  }

  if (!connection) {
    connection = Array.from(inMemoryChannelsMap.values()).find(
      (c) => c.sellerId?.toString() === sellerId?.toString() && c.provider === 'AMAZON'
    );
  }

  const channelId = connection?._id || connection?.id || 'DEFAULT_CHANNEL';

  let totalAmazonOrders = 0;
  let fbaOrders = 0;
  let fbmOrders = 0;

  try {
    [totalAmazonOrders, fbaOrders, fbmOrders] = await Promise.all([
      Order.countDocuments({ sellerId, channel: 'AMAZON' }),
      Order.countDocuments({ sellerId, channel: 'AMAZON', fulfillmentChannel: 'FBA' }),
      Order.countDocuments({ sellerId, channel: 'AMAZON', fulfillmentChannel: 'FBM' }),
    ]);
  } catch (err) {
    const memOrders = Array.from(inMemoryOrdersMap.values()).filter(
      (o) => o.sellerId?.toString() === sellerId?.toString() && o.channel === 'AMAZON'
    );
    totalAmazonOrders = memOrders.length;
    fbaOrders = memOrders.filter((o) => o.fulfillmentChannel === 'FBA').length;
    fbmOrders = memOrders.filter((o) => o.fulfillmentChannel === 'FBM').length;
  }

  let lastSync = null;
  try {
    lastSync = await withDbTimeout(
      SyncHistory.findOne({ sellerId, provider: 'AMAZON', syncType: 'ORDER' }).sort({ createdAt: -1 }),
      1000
    );
  } catch (err) {
    // fallback
  }

  const isSyncRunning = await isDistributedLockActive({
    sellerId,
    channelId,
    resource: 'AMAZON_ORDER_SYNC',
  });

  return {
    connectionStatus: connection?.status || 'DISCONNECTED',
    marketplaceId: connection?.marketplaceId || 'A21TJRUUN4KGV',
    marketplaceRegion: connection?.marketplaceRegion || 'eu',
    totalAmazonOrders,
    fbaOrders,
    fbmOrders,
    isSyncRunning,
    lastSync: lastSync
      ? {
          status: lastSync.status,
          startedAt: lastSync.startedAt,
          completedAt: lastSync.completedAt,
          recordsProcessed: lastSync.recordsProcessed,
          recordsSucceeded: lastSync.recordsSucceeded,
          recordsFailed: lastSync.recordsFailed,
          totalCreated: lastSync.totalCreated,
          totalUpdated: lastSync.totalUpdated,
        }
      : null,
  };
};

/**
 * Legacy Adapter Compatibility: fetchAmazonOrders
 */
export const fetchAmazonOrders = async (client, params = {}) => {
  return await searchAmazonOrders(client, params);
};

/**
 * Legacy Adapter Compatibility: fetchAmazonOrderById
 */
export const fetchAmazonOrderById = async (client, externalOrderId) => {
  const rawOrder = await getAmazonOrder(client, externalOrderId);
  if (!rawOrder) {
    return mapAmazonOrderToMaster({
      AmazonOrderId: externalOrderId,
      OrderTotal: { Amount: 0 },
      OrderItems: [],
    });
  }
  return mapAmazonOrderToMaster(rawOrder);
};

/**
 * ============================================================================
 * TASK 7: AMAZON ORDER DETAILS, RETURNS & REFUNDS VISIBILITY SERVICES
 * Strictly read-only operations adhering to Amazon Orders API v2026-01-01
 * and Finances API specifications.
 * ============================================================================
 */

/**
 * Get Amazon Order Details with full authorized metadata, items, fulfillment,
 * returns, and refunds visibility. Tenant-isolated.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {string} orderId Order number, externalOrderId, or MongoDB _id
 * @param {Object} [options]
 * @param {boolean} [options.syncLive] Fetch fresh state from SP-API v2026-01-01
 * @returns {Promise<Object>}
 */
export const getAmazonOrderDetailsService = async (tenant, orderId, options = {}) => {
  const { sellerId } = tenant;
  const cleanId = String(orderId).trim();

  let order = null;
  try {
    order = await withDbTimeout(
      Order.findOne({
        sellerId,
        channel: 'AMAZON',
        $or: [{ _id: cleanId }, { externalOrderId: cleanId }, { orderNumber: cleanId }],
      }),
      2000
    );
  } catch (err) {
    // DB offline fallback
  }

  if (!order) {
    order = Array.from(inMemoryOrdersMap.values()).find(
      (o) =>
        o.sellerId?.toString() === sellerId?.toString() &&
        (o.channel?.toUpperCase() === 'AMAZON' || o.provider?.toUpperCase() === 'AMAZON') &&
        (o._id?.toString() === cleanId || o.externalOrderId === cleanId || o.orderNumber === cleanId)
    );
  }

  // If live sync is requested and order is known or connection exists
  if (options.syncLive && (order || options.allowDirectFetch)) {
    try {
      const syncResult = await syncSingleAmazonOrderService(tenant, cleanId);
      if (syncResult?.order) {
        order = syncResult.order;
      }
    } catch (syncErr) {
      console.warn(`[Amazon SP-API] Live order sync warning for ${cleanId}:`, syncErr.message);
    }
  }

  if (!order) {
    const err = new Error(`Amazon order "${cleanId}" not found for this seller account.`);
    err.status = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  // Multi-tenant security check
  if (order.sellerId?.toString() !== sellerId?.toString()) {
    const authErr = new Error('Unauthorized: You do not have permission to access this order.');
    authErr.status = 403;
    authErr.code = 'UNAUTHORIZED_ACCESS';
    throw authErr;
  }

  // Find any linked returns
  let linkedReturns = [];
  try {
    linkedReturns = await withDbTimeout(
      Return.find({
        sellerId,
        $or: [{ orderId: order._id }, { externalOrderId: order.externalOrderId }],
      }),
      1500
    );
  } catch (err) {
    linkedReturns = Array.from(inMemoryReturnsMap.values()).filter(
      (r) =>
        r.sellerId?.toString() === sellerId?.toString() &&
        (r.orderId?.toString() === order._id?.toString() || r.externalOrderId === order.externalOrderId)
    );
  }

  return {
    order,
    items: order.items || [],
    fulfillment: {
      fulfillmentChannel: order.fulfillmentChannel,
      fulfillmentStatus: order.fulfillmentStatus,
      shipments: order.shipmentDetails || [],
      salesChannel: order.sourceMetadata?.salesChannel || 'Amazon.in',
      shipServiceLevel: order.sourceMetadata?.shipServiceLevel || '',
    },
    pricingSummary: {
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      discount: order.discount,
      tax: order.tax,
      totalAmount: order.totalAmount,
      currency: order.currency,
      paymentMethod: order.payment?.method || 'AMAZON_PAY',
      paymentStatus: order.payment?.status || 'PAID',
    },
    returns: {
      returnStatus: order.returnStatus || 'NONE',
      returnDetails: order.returnDetails || null,
      linkedReturns: linkedReturns || [],
    },
    refunds: {
      refundAmount: order.refundAmount || 0,
      refundStatus: order.refundStatus || 'NONE',
      refundDate: order.refundDate || null,
      financialRefunds: order.sourceMetadata?.financialRefunds || null,
    },
    syncInfo: {
      apiVersion: order.sourceMetadata?.apiVersion || '2026-01-01',
      lastSyncedAt: order.lastSyncedAt,
      originalAmazonStatus: order.originalAmazonStatus || order.sourceMetadata?.originalAmazonStatus,
    },
  };
};

/**
 * Get Line Items for an Amazon Order.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {string} orderId
 * @returns {Promise<{ orderId: string, items: Array, totalItems: number }>}
 */
export const getAmazonOrderItemsService = async (tenant, orderId) => {
  const details = await getAmazonOrderDetailsService(tenant, orderId);
  return {
    orderId: details.order.externalOrderId || details.order.orderNumber,
    items: details.items,
    totalItems: details.items.length,
  };
};

/**
 * Synchronize a single Amazon Order from SP-API v2026-01-01 and Finances API.
 * Read-only operation.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {string} orderId
 * @returns {Promise<{ success: boolean, order: Object }>}
 */
export const syncSingleAmazonOrderService = async (tenant, orderId) => {
  const { sellerId, storeId = null } = tenant;
  const cleanId = String(orderId).trim();

  // 1. Obtain channel connection (sellerId + storeId scoped)
  let connection = null;
  try {
    const connQuery = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
    connection = await withDbTimeout(ChannelConnection.findOne(connQuery), 1000);
  } catch (err) {
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

  if (!connection || connection.status !== 'CONNECTED') {
    const connErr = new Error('Amazon channel is not connected for this seller account.');
    connErr.status = 400;
    connErr.code = 'CHANNEL_NOT_CONNECTED';
    throw connErr;
  }

  const decrypted = decryptCredentials(connection.credentials);
  if (!decrypted || !decrypted.refreshToken) {
    const credErr = new Error('Amazon channel credentials missing or invalid.');
    credErr.status = 401;
    credErr.code = 'INVALID_CREDENTIALS';
    throw credErr;
  }

  const client = new AmazonSpApiClient({
    sellerId: sellerId ? sellerId.toString() : null,
    refreshToken: decrypted.refreshToken,
    region: connection.marketplaceRegion || 'eu',
    marketplaceId: connection.marketplaceId || 'A21TJRUUN4KGV',
  });

  // 2. Query Orders API v2026-01-01 getOrder
  const rawOrder = await getAmazonOrder(client, cleanId, {
    includedData: ['PROMOTION', 'FULFILLMENT', 'PACKAGES', 'TAX', 'PAYMENT', 'PROCEEDS', 'EXPENSE'],
  });

  if (!rawOrder) {
    const notFound = new Error(`Order ${cleanId} not found in Amazon SP-API.`);
    notFound.status = 404;
    notFound.code = 'AMAZON_ORDER_NOT_FOUND';
    throw notFound;
  }

  // 3. Optional: query Finances API for refund events
  let financialEvents = null;
  try {
    financialEvents = await client.getOrderFinancialEvents(cleanId);
  } catch (finErr) {
    // Non-blocking
  }

  // 4. Map into database payload
  const payload = mapAmazonOrderToDbPayload(rawOrder, {
    sellerId,
    channelId: connection._id || connection.id,
    marketplaceId: connection.marketplaceId,
    financialEvents,
  });

  // 5. Upsert into database
  let savedOrder = null;
  try {
    savedOrder = await Order.findOneAndUpdate(
      { sellerId, externalOrderId: payload.externalOrderId },
      { $set: payload },
      { new: true, upsert: true }
    );
  } catch (dbErr) {
    if (isProductionEnv()) {
      const err = new Error('Service Unavailable: Unable to persist Amazon order in MongoDB.');
      err.code = 'SERVICE_UNAVAILABLE';
      err.status = 503;
      throw err;
    }
    const scopedKey = `${sellerId}:${cleanId}`;
    const memoryOrder = {
      _id: `mem_amz_ord_${scopedKey}`,
      id: `mem_amz_ord_${scopedKey}`,
      storeId: storeId ? String(storeId) : null,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryOrdersMap.set(scopedKey, memoryOrder);
    savedOrder = memoryOrder;
  }

  return {
    success: true,
    order: savedOrder,
  };
};

/**
 * Retrieve Returns for Amazon Orders (Read-Only).
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {Object} [query]
 * @returns {Promise<{ returns: Array, pagination: Object }>}
 */
export const getAmazonReturnsService = async (tenant, query = {}) => {
  const { sellerId } = tenant;
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {
    sellerId,
    channel: 'AMAZON',
  };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.rmaNumber) {
    filter.rmaNumber = { $regex: query.rmaNumber, $options: 'i' };
  }

  if (query.externalOrderId) {
    filter.externalOrderId = { $regex: query.externalOrderId, $options: 'i' };
  }

  let returns = [];
  let total = 0;

  try {
    returns = await Return.find(filter)
      .populate('orderId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    total = await Return.countDocuments(filter);
  } catch (err) {
    const all = Array.from(inMemoryReturnsMap.values()).filter(
      (r) => r.sellerId?.toString() === sellerId?.toString() && r.channel === 'AMAZON'
    );
    returns = all.slice(skip, skip + limit);
    total = all.length;
  }

  // Also include any Amazon orders from Order collection that have return/refund status
  // if no explicit returns were generated yet
  if (returns.length === 0 && !query.rmaNumber) {
    let returnOrders = [];
    try {
      returnOrders = await Order.find({
        sellerId,
        channel: 'AMAZON',
        $or: [
          { status: { $in: ['CANCELLED', 'RETURNED', 'RETURN_REQUESTED', 'REFUNDED'] } },
          { refundAmount: { $gt: 0 } },
          { 'returnDetails.isReturned': true },
        ],
      }).limit(limit);
    } catch (e) {
      returnOrders = Array.from(inMemoryOrdersMap.values()).filter(
        (o) =>
          o.sellerId?.toString() === sellerId?.toString() &&
          o.channel === 'AMAZON' &&
          (o.status === 'CANCELLED' || o.refundAmount > 0 || o.returnDetails?.isReturned)
      );
    }

    const synthesizedReturns = returnOrders.map((ord) => ({
      _id: `synth_ret_${ord.externalOrderId || ord._id}`,
      id: `synth_ret_${ord.externalOrderId || ord._id}`,
      rmaNumber: `RMA-${ord.externalOrderId}`,
      externalOrderId: ord.externalOrderId,
      orderId: ord,
      channel: 'AMAZON',
      items: ord.items?.map((it) => ({
        sku: it.sku,
        asin: it.asin,
        title: it.title,
        quantity: it.cancelledQuantity || it.quantity,
        reason: ord.returnDetails?.returnReason || 'Buyer Cancelled / Returned',
        condition: ord.returnDetails?.condition || 'NEW',
        disposition: ord.returnDetails?.disposition || 'PENDING_INSPECTION',
      })) || [],
      status: ord.returnDetails?.returnStatus || (ord.status === 'CANCELLED' ? 'CANCELLED' : 'RETURNED'),
      refundStatus: ord.refundStatus || (ord.refundAmount > 0 ? 'PROCESSED' : 'NOT_APPLICABLE'),
      refundAmount: ord.refundAmount || ord.totalAmount || 0,
      refundDate: ord.refundDate || ord.lastUpdateDate || ord.createdAt,
      source: 'AMAZON_ORDER_STATUS',
      createdAt: ord.createdAt || new Date(),
    }));

    returns = synthesizedReturns;
    total = synthesizedReturns.length;
  }

  return {
    returns,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

/**
 * Get Refund Information for a specific Amazon Order.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {string} orderId
 * @returns {Promise<Object>}
 */
export const getAmazonOrderRefundsService = async (tenant, orderId) => {
  const details = await getAmazonOrderDetailsService(tenant, orderId);
  return {
    orderId: details.order.externalOrderId || details.order.orderNumber,
    refundAmount: details.refunds.refundAmount,
    refundStatus: details.refunds.refundStatus,
    refundDate: details.refunds.refundDate,
    financialRefunds: details.refunds.financialRefunds,
    orderTotal: details.order.totalAmount,
    currency: details.order.currency,
  };
};

/**
 * Synchronize Returns and Refunds for Amazon Orders (Read-Only).
 *
 * @param {Object} tenant { sellerId, storeId }
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export const syncAmazonReturnsService = async (tenant, options = {}) => {
  const { sellerId } = tenant;

  // 1. Scan for Amazon orders with cancel/return/refund activity
  let candidateOrders = [];
  try {
    candidateOrders = await Order.find({
      sellerId,
      channel: 'AMAZON',
      $or: [
        { status: { $in: ['CANCELLED', 'RETURNED', 'RETURN_REQUESTED', 'REFUNDED'] } },
        { refundAmount: { $gt: 0 } },
        { 'returnDetails.isReturned': true },
      ],
    });
  } catch (err) {
    candidateOrders = Array.from(inMemoryOrdersMap.values()).filter(
      (o) =>
        o.sellerId?.toString() === sellerId?.toString() &&
        o.channel === 'AMAZON' &&
        (o.status === 'CANCELLED' || o.refundAmount > 0 || o.returnDetails?.isReturned)
    );
  }

  let returnsCreated = 0;
  let returnsUpdated = 0;

  for (const ord of candidateOrders) {
    const extId = ord.externalOrderId || ord.orderNumber;
    const rma = `RMA-${extId}`;

    const returnItems = (ord.items || []).map((it) => ({
      sku: it.sku,
      asin: it.asin,
      title: it.title,
      quantity: it.cancelledQuantity || it.quantity || 1,
      reason: ord.returnDetails?.returnReason || (ord.status === 'CANCELLED' ? 'Buyer Cancelled' : 'Customer Return'),
      condition: ord.returnDetails?.condition || 'NEW',
      inspectionStatus: 'PENDING',
      disposition: ord.returnDetails?.disposition || 'PENDING_INSPECTION',
      restockedQuantity: 0,
    }));

    const returnDoc = {
      sellerId,
      storeId: ord.storeId || null,
      channelId: ord.channelId || null,
      marketplaceId: ord.marketplaceId || 'A21TJRUUN4KGV',
      rmaNumber: rma,
      orderId: ord._id,
      externalOrderId: extId,
      channel: 'AMAZON',
      items: returnItems,
      status: ord.returnDetails?.returnStatus || (ord.status === 'CANCELLED' ? 'CANCELLED' : 'RETURNED'),
      refundStatus: ord.refundStatus || (ord.refundAmount > 0 ? 'PROCESSED' : 'PENDING'),
      refundAmount: ord.refundAmount || ord.totalAmount || 0,
      refundDate: ord.refundDate || ord.lastUpdateDate || new Date(),
      source: 'AMAZON',
      sourceMetadata: {
        originalAmazonStatus: ord.originalAmazonStatus,
        lastSyncedAt: new Date(),
      },
    };

    try {
      const existing = await Return.findOne({ sellerId, rmaNumber: rma });
      if (existing) {
        await Return.updateOne({ _id: existing._id }, { $set: returnDoc });
        returnsUpdated++;
      } else {
        await Return.create(returnDoc);
        returnsCreated++;
      }
    } catch (dbErr) {
      if (isProductionEnv()) {
        const err = new Error('Service Unavailable: Unable to persist Amazon return in MongoDB.');
        err.code = 'SERVICE_UNAVAILABLE';
        err.status = 503;
        throw err;
      }
      const scopedRmaKey = `${sellerId}:${rma}`;
      inMemoryReturnsMap.set(scopedRmaKey, {
        _id: `mem_ret_${scopedRmaKey}`,
        id: `mem_ret_${scopedRmaKey}`,
        ...returnDoc,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      returnsCreated++;
    }
  }

  return {
    success: true,
    summary: {
      candidateOrdersScanned: candidateOrders.length,
      returnsCreated,
      returnsUpdated,
      totalReturns: candidateOrders.length,
    },
    message: `Amazon returns sync completed: ${returnsCreated} created, ${returnsUpdated} updated.`,
  };
};

/**
 * Get Amazon Returns & Refunds Status Telemetry.
 *
 * @param {Object} tenant { sellerId, storeId }
 * @returns {Promise<Object>}
 */
export const getAmazonReturnsStatusService = async (tenant) => {
  const { sellerId } = tenant;

  let totalReturns = 0;
  let totalRefundAmount = 0;

  try {
    totalReturns = await Return.countDocuments({ sellerId, channel: 'AMAZON' });
    const refundAgg = await Return.aggregate([
      { $match: { sellerId, channel: 'AMAZON' } },
      { $group: { _id: null, totalRefund: { $sum: '$refundAmount' } } },
    ]);
    totalRefundAmount = refundAgg[0]?.totalRefund || 0;
  } catch (err) {
    const list = Array.from(inMemoryReturnsMap.values()).filter(
      (r) => r.sellerId?.toString() === sellerId?.toString() && r.channel === 'AMAZON'
    );
    totalReturns = list.length;
    totalRefundAmount = list.reduce((acc, r) => acc + (r.refundAmount || 0), 0);
  }

  return {
    provider: 'AMAZON',
    channel: 'AMAZON',
    totalReturns,
    totalRefundAmount,
    currency: 'INR',
    lastSyncTimestamp: new Date(),
  };
};
