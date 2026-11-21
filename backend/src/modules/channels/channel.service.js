import mongoose from 'mongoose';
import { ChannelConnection } from './channelConnection.model.js';
import { SyncHistory } from './syncHistory.model.js';
import { MarketplaceListing } from './marketplaceListing.model.js';
import { Product } from '../products/product.model.js';
import { inMemoryProductsMap } from '../products/product.service.js';
import {
  encryptCredentials,
  decryptCredentials,
  generateOAuthState,
  verifyOAuthStateDurable,
} from '../../utils/encryption.js';
import { getChannelAdapter } from '../../integrations/core/integration.factory.js';
import { config } from '../../config/env.js';
import { isProductionEnv } from '../../config/storage.js';
import {
  handleAmazonAuth,
  exchangeLwaAuthCode,
  evictLwaTokenCache,
} from '../../integrations/marketplaces/amazon/amazon.auth.js';
import {
  AmazonSpApiClient,
  AMAZON_EXECUTION_OUTCOMES,
} from '../../integrations/marketplaces/amazon/amazon.client.js';
import {
  verifyAmazonSellerAuthorization,
  INDIA_MARKETPLACE_ID,
  AMAZON_VERIFICATION_MODES,
  SANDBOX_STATIC_MOCK_MESSAGE,
} from '../../integrations/marketplaces/amazon/amazon.sellers.service.js';

export const inMemoryChannelsMap = new Map();
export const inMemorySyncHistoryMap = new Map();
export const inMemoryListingsMap = new Map();

const createProductionDbError = (context = 'channel data') => {
  const err = new Error(`Service Unavailable: Unable to access ${context} in MongoDB.`);
  err.code = 'SERVICE_UNAVAILABLE';
  err.status = 503;
  err.statusCode = 503;
  return err;
};

/**
 * Symmetric store matching helper:
 * - If both record and tenant have no storeId (null/undefined/''), match = true
 * - If one has a storeId and the other does not, or storeIds differ, match = false
 */
export const matchesTenantStore = (record, { sellerId, storeId = null } = {}) => {
  if (!record || !sellerId) return false;
  const reqSeller = String(sellerId);
  const recSeller = record.sellerId !== undefined && record.sellerId !== null ? String(record.sellerId) : null;
  const recTenant = record.tenantId !== undefined && record.tenantId !== null ? String(record.tenantId) : null;
  if (recSeller !== reqSeller && recTenant !== reqSeller) return false;

  const reqStore = storeId ? String(storeId) : null;
  const recStore = record.storeId ? String(record.storeId) : null;
  return recStore === reqStore;
};

const evictConnectionLwaCache = (conn, sellerId) => {
  if (!conn) return;
  const provider = String(conn.provider || conn.channel || '').toUpperCase();
  if (provider !== 'AMAZON') return;
  let refreshToken = null;
  try {
    if (conn.credentials) {
      const decrypted = decryptCredentials(conn.credentials);
      refreshToken = decrypted?.refreshToken || null;
    }
  } catch {
    // Best-effort token extraction; still evict by sellerId index
  }
  evictLwaTokenCache({
    sellerId: sellerId || conn.sellerId || conn.tenantId || null,
    clientId: config.amazon?.clientId,
    refreshToken,
  });
};

const withDbTimeout = (promise, ms = 3000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database operation timed out after ${ms}ms`)), ms)
    ),
  ]);
};

/**
 * Sanitize channel connection object so secrets are NEVER returned to frontend
 */
export const sanitizeChannelConnection = (conn) => {
  if (!conn) return null;
  const obj = typeof conn.toObject === 'function' ? conn.toObject() : { ...conn };
  delete obj.credentials;
  return obj;
};

export const connectChannelService = async (tenant, connectData) => {
  const { sellerId, storeId } = tenant;
  const { provider, displayName, externalAccountId, externalStoreId, credentials, metadata } = connectData;

  const normProvider = provider.toUpperCase().trim();
  const type = ['SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE'].includes(normProvider)
    ? 'ECOMMERCE'
    : normProvider === 'POS'
    ? 'POS'
    : 'MARKETPLACE';

  const encrypted = encryptCredentials(credentials);

  const payload = {
    sellerId,
    storeId: storeId || null,
    provider: normProvider,
    type,
    status: 'CONNECTED',
    displayName,
    externalAccountId: externalAccountId || '',
    externalStoreId: externalStoreId || '',
    credentials: encrypted,
    metadata: metadata || {},
    lastSyncAt: new Date(),
    lastSuccessfulSyncAt: new Date(),
  };

  let connection = null;

  try {
    // Upsert or create channel connection with DB timeout
    connection = await withDbTimeout(
      ChannelConnection.findOneAndUpdate(
        { sellerId, provider: normProvider },
        payload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      3000
    );
  } catch (dbErr) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel connection');
    }
    console.warn('DB connect channel failed/bypassed, using memory map:', dbErr.message);
    const existing = Array.from(inMemoryChannelsMap.values()).find(
      (c) => matchesTenantStore(c, { sellerId, storeId }) && c.provider === normProvider
    );
    const id = existing ? existing._id : new mongoose.Types.ObjectId().toString();
    connection = {
      _id: id,
      id,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryChannelsMap.set(id, connection);
  }

  // Execute immediate connection test using adapter
  try {
    const rawCredentials = credentials;
    const adapter = getChannelAdapter(normProvider, { credentials: rawCredentials });
    const testResult = await adapter.testConnection();
    if (testResult.success) {
      connection.status = 'CONNECTED';
      connection.lastError = null;
    } else {
      connection.status = 'PENDING';
      connection.lastError = testResult.message;
    }
  } catch (adapterErr) {
    connection.status = 'PENDING';
    connection.lastError = adapterErr.message;
  }

  try {
    if (typeof connection.save === 'function') {
      await withDbTimeout(connection.save(), 3000);
    } else if (!isProductionEnv()) {
      inMemoryChannelsMap.set(connection._id || connection.id, connection);
    }
  } catch (saveErr) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel connection save');
    }
    inMemoryChannelsMap.set(connection._id || connection.id, connection);
  }

  return sanitizeChannelConnection(connection);
};

export const getChannelsService = async (sellerId, query = {}) => {
  const storeId = query?.storeId || null;
  let dbChannels = [];
  try {
    const dbFilter = { sellerId };
    if (storeId) {
      dbFilter.storeId = storeId.toString();
    }
    dbChannels = await withDbTimeout(ChannelConnection.find(dbFilter).sort({ createdAt: -1 }), 3000);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel connections');
    }
    console.warn('DB fetch channels failed/bypassed:', err.message);
  }

  if (isProductionEnv()) {
    return dbChannels.map(sanitizeChannelConnection);
  }

  const memChannels = Array.from(inMemoryChannelsMap.values()).filter((c) =>
    storeId ? matchesTenantStore(c, { sellerId, storeId }) : c.sellerId && c.sellerId.toString() === sellerId.toString()
  );

  const channelMap = new Map();
  dbChannels.forEach((c) => {
    const id = c._id ? c._id.toString() : c.id;
    channelMap.set(id, c);
  });
  memChannels.forEach((c) => {
    const id = c._id ? c._id.toString() : c.id;
    if (!channelMap.has(id)) {
      channelMap.set(id, c);
    }
  });

  const allChannels = Array.from(channelMap.values());
  return allChannels.map(sanitizeChannelConnection);
};

export const getChannelByIdService = async (sellerId, channelId, storeId = null) => {
  let conn = null;
  try {
    const filter = { sellerId, _id: channelId };
    if (storeId) filter.storeId = storeId.toString();
    conn = await ChannelConnection.findOne(filter);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel connection');
    }
    console.warn('DB fetch channel by ID failed/bypassed:', err.message);
  }

  if (!conn && !isProductionEnv()) {
    const memConn = inMemoryChannelsMap.get(channelId);
    if (memConn && matchesTenantStore(memConn, { sellerId, storeId })) {
      return sanitizeChannelConnection(memConn);
    }
  }

  if (!conn || conn.sellerId.toString() !== sellerId.toString()) {
    throw new Error('Channel connection not found or unauthorized');
  }

  return sanitizeChannelConnection(conn);
};

export const disconnectChannelService = async (sellerId, channelId) => {
  let conn = null;
  try {
    conn = await ChannelConnection.findOne({ sellerId, _id: channelId });
    if (conn) {
      evictConnectionLwaCache(conn, sellerId);
      conn.status = 'DISCONNECTED';
      conn.credentials = null;
      conn.lastError = null;
      await conn.save();

      // Synchronize/evict any stale local memory copy
      const memConn = inMemoryChannelsMap.get(channelId);
      if (memConn && memConn.sellerId?.toString() === sellerId.toString()) {
        memConn.status = 'DISCONNECTED';
        memConn.credentials = null;
        memConn.lastError = null;
      }

      return sanitizeChannelConnection(conn);
    }
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel disconnect');
    }
    console.warn('DB disconnect channel failed/bypassed:', err.message);
  }

  if (!isProductionEnv()) {
    const memConn = inMemoryChannelsMap.get(channelId);
    if (memConn && memConn.sellerId?.toString() === sellerId.toString()) {
      evictConnectionLwaCache(memConn, sellerId);
      memConn.status = 'DISCONNECTED';
      memConn.credentials = null;
      memConn.lastError = null;
      inMemoryChannelsMap.set(channelId, memConn);
      return sanitizeChannelConnection(memConn);
    }
  }

  throw new Error('Channel connection not found or unauthorized');
};

export const testChannelConnectionService = async (sellerId, channelId) => {
  let conn = null;
  try {
    conn = await ChannelConnection.findOne({ sellerId, _id: channelId });
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel connection');
    }
    console.warn('DB find channel for test failed/bypassed:', err.message);
  }

  if (!conn && !isProductionEnv()) {
    const mem = inMemoryChannelsMap.get(channelId);
    if (mem && mem.sellerId?.toString() === sellerId.toString()) {
      conn = mem;
    }
  }

  if (!conn || conn.sellerId.toString() !== sellerId.toString()) {
    throw new Error('Channel connection not found');
  }

  const decryptedCredentials = decryptCredentials(conn.credentials) || {};
  const adapter = getChannelAdapter(conn.provider, {
    credentials: { ...decryptedCredentials, sellerId: sellerId.toString() },
  });
  const result = await adapter.testConnection();

  if (result.success) {
    conn.status = 'CONNECTED';
    conn.lastError = null;
  } else {
    conn.status = 'ERROR';
    conn.lastError = result.message;
  }

  try {
    if (typeof conn.save === 'function') await conn.save();
  } catch (sErr) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel status update');
    }
    inMemoryChannelsMap.set(channelId, conn);
  }

  return { testResult: result, channel: sanitizeChannelConnection(conn) };
};

export const syncChannelService = async (tenant, channelId, syncType = 'FULL') => {
  const { sellerId, storeId } = tenant;
  const conn = await getChannelByIdService(sellerId, channelId, storeId || null);

  const historyPayload = {
    sellerId,
    channelId: conn._id || channelId,
    provider: conn.provider,
    syncType,
    direction: 'BIDIRECTIONAL',
    status: 'SUCCESS',
    startedAt: new Date(),
    completedAt: new Date(),
    recordsProcessed: 10,
    recordsSucceeded: 10,
    recordsFailed: 0,
  };

  let syncLog = null;
  try {
    syncLog = await SyncHistory.create(historyPayload);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('sync history');
    }
    const id = new mongoose.Types.ObjectId().toString();
    syncLog = { _id: id, ...historyPayload };
    inMemorySyncHistoryMap.set(id, syncLog);
  }

  return { syncHistory: syncLog, channel: conn };
};

export const publishProductToChannelService = async (tenant, productId, channelId) => {
  const { sellerId, storeId = null } = tenant;
  let product = null;

  try {
    const productFilter = { sellerId, _id: productId };
    if (storeId) productFilter.storeId = storeId.toString();
    product = await Product.findOne(productFilter);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('master product');
    }
    // Development/offline test fallback handled safely below with strict tenant & store check
  }

  if (!product && !isProductionEnv()) {
    const memProduct = inMemoryProductsMap.get(String(productId));
    if (memProduct && matchesTenantStore(memProduct, { sellerId, storeId })) {
      product = memProduct;
    } else if (memProduct) {
      const authErr = new Error('Unauthorized cross-tenant or cross-store product access.');
      authErr.code = 'UNAUTHORIZED_ACCESS';
      authErr.status = 403;
      authErr.statusCode = 403;
      throw authErr;
    }
  }

  if (!product) {
    throw new Error('Master Product not found');
  }

  let conn = null;
  try {
    const connFilter = { sellerId, _id: channelId };
    if (storeId) connFilter.storeId = storeId.toString();
    conn = await ChannelConnection.findOne(connFilter);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('channel connection');
    }
  }

  if (!conn && !isProductionEnv()) {
    const memConn = inMemoryChannelsMap.get(String(channelId));
    if (memConn && matchesTenantStore(memConn, { sellerId, storeId })) {
      conn = memConn;
    } else if (memConn) {
      const authErr = new Error('Unauthorized cross-tenant or cross-store channel access.');
      authErr.code = 'UNAUTHORIZED_ACCESS';
      authErr.status = 403;
      authErr.statusCode = 403;
      throw authErr;
    }
  }

  if (!conn) {
    throw new Error('Channel connection not found');
  }

  const provider = String(conn.provider || '').toUpperCase();
  if (provider === 'AMAZON') {
    const error = new Error(
      'Direct Amazon publishing via legacy route is disabled. Please use the authoritative Amazon SP-API workflow at /api/channels/amazon/listings/submissions.'
    );
    error.code = 'AMAZON_LEGACY_PUBLISHING_DISABLED';
    error.statusCode = 400;
    throw error;
  }

  const rawCredentials = decryptCredentials(conn.credentials) || {};
  const adapter = getChannelAdapter(conn.provider, {
    credentials: { ...rawCredentials, sellerId: sellerId.toString() },
  });
  const publishResult = await adapter.publishProduct(product);

  const listingPayload = {
    sellerId,
    storeId: storeId ? storeId.toString() : null,
    productId,
    channelId,
    provider: conn.provider,
    externalProductId: publishResult.externalProductId || `ext-${Date.now()}`,
    externalSku: product.sku,
    status: publishResult.success ? 'PUBLISHED' : 'FAILED',
    publishedAt: new Date(),
    lastSyncedAt: new Date(),
  };

  let listing = null;
  try {
    listing = await MarketplaceListing.create(listingPayload);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('marketplace listing');
    }
    const id = `${sellerId}:${product.sku || new mongoose.Types.ObjectId().toString()}`;
    listing = { _id: id, id, ...listingPayload };
    inMemoryListingsMap.set(id, listing);
  }

  return { listing, publishResult };
};

/**
 * Initiate Amazon OAuth authorization flow
 * Encodes sellerId, storeId, and region inside the signed single-use state token,
 * and includes redirect_uri consistently with Developer Central & LWA token exchange.
 */
export const getAmazonOAuthUrlService = async (tenant, options = {}) => {
  const { sellerId, storeId = null } = tenant;
  const appId = config.amazon?.appId || process.env.AMAZON_SP_API_APP_ID;

  if (!appId) {
    throw new Error('Amazon SP-API Application ID (AMAZON_SP_API_APP_ID) is not configured.');
  }

  // Region-aware Seller Central URL (India default: sellercentral.amazon.in)
  const region = (options.region || config.amazon?.region || process.env.AMAZON_SP_API_REGION || 'eu').toLowerCase().trim();
  const sellerCentralHosts = {
    eu: 'sellercentral.amazon.in',
    uk: 'sellercentral-europe.amazon.com',
    na: 'sellercentral.amazon.com',
    fe: 'sellercentral-japan.amazon.com',
  };
  const host = sellerCentralHosts[region] || 'sellercentral.amazon.in';

  // Generate cryptographically signed state token with 15-minute expiration binding seller + store + region
  const state = generateOAuthState(sellerId, 'AMAZON', 15 * 60 * 1000, {
    storeId: storeId ? storeId.toString() : null,
    region: region === 'uk' ? 'eu' : region,
  });

  // Draft / sandbox apps explicitly default to sandbox and require &version=beta
  const activeEnv = (config.amazon?.env || process.env.AMAZON_SP_API_ENV || 'sandbox').toLowerCase().trim();
  const isSandbox = activeEnv !== 'production';
  const versionParam = isSandbox ? '&version=beta' : '';

  const redirectUri = (options.redirectUri || config.amazon?.redirectUri || process.env.AMAZON_SP_API_REDIRECT_URI || '').trim();
  const redirectParam = redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : '';

  const authorizationUrl = `https://${host}/apps/authorize/consent?application_id=${encodeURIComponent(
    appId
  )}&state=${encodeURIComponent(state)}${redirectParam}${versionParam}`;

  return {
    authorizationUrl,
    state,
    appId,
    redirectUri: redirectUri || null,
    region: region === 'uk' ? 'eu' : region,
    environment: isSandbox ? 'sandbox' : 'production',
    expiresIn: 900,
    isSandbox,
  };
};

/**
 * Build tenant-isolated query for ChannelConnection
 * Matches either sellerId or tenantId, across string and ObjectId formats,
 * plus optional storeId boundary when store context is supplied.
 */
export const buildTenantConnectionQuery = (sellerId, provider = 'AMAZON', storeId = null) => {
  const sellerIdStr = sellerId ? sellerId.toString() : '';
  const sellerIdConditions = [
    { sellerId: sellerIdStr },
    { tenantId: sellerIdStr },
  ];

  if (mongoose.Types.ObjectId.isValid(sellerIdStr)) {
    const oid = new mongoose.Types.ObjectId(sellerIdStr);
    sellerIdConditions.push({ sellerId: oid });
    sellerIdConditions.push({ tenantId: oid });
  }

  const providerConditions = [
    { provider: provider.toUpperCase() },
    { channel: provider.toLowerCase() },
  ];

  const clauses = [
    { $or: sellerIdConditions },
    { $or: providerConditions },
  ];

  if (storeId) {
    const storeIdStr = storeId.toString();
    const storeConditions = [{ storeId: storeIdStr }];
    if (mongoose.Types.ObjectId.isValid(storeIdStr)) {
      storeConditions.push({ storeId: new mongoose.Types.ObjectId(storeIdStr) });
    }
    clauses.push({ $or: storeConditions });
  }

  return { $and: clauses };
};

/**
 * Handle Amazon OAuth callback from Seller Central.
 * - Supports BOTH public browser redirects (tenant = null; seller/store bound strictly from verified signed state)
 *   and authenticated API callbacks (cross-checks tenant.sellerId against state.tenantId).
 * - Atomically consumes state nonce in MongoDB (fail-closed on replay or DB failure).
 * - Exchanges authorization code with matching redirect_uri.
 * - Verifies seller authorization & India marketplace (A21TJRUUN4KGV) via GET /sellers/v1/marketplaceParticipations
 *   BEFORE marking connection CONNECTED.
 */
export const handleAmazonOAuthCallbackService = async (tenant, queryParams, options = {}) => {
  const { spapi_oauth_code, state, selling_partner_id } = queryParams || {};

  if (!state || typeof state !== 'string') {
    const err = new Error('Missing state parameter in Amazon OAuth callback.');
    err.code = 'MISSING_STATE';
    err.status = 400;
    throw err;
  }

  const expectedTenantId = tenant?.sellerId ? tenant.sellerId.toString() : null;

  // 1. Durable atomic MongoDB OAuth state verification (CSRF, provider, & cross-instance replay protection)
  const stateVerification = await verifyOAuthStateDurable(state, expectedTenantId, {
    expectedProvider: 'AMAZON',
    nonceModel: options.nonceModel || null,
  });

  if (!stateVerification.valid) {
    const isCrossTenant = String(stateVerification.error || '').toLowerCase().includes('cross-tenant');
    const isExpired = String(stateVerification.error || '').toLowerCase().includes('expired');
    const stateErr = new Error(`Amazon OAuth state verification failed: ${stateVerification.error}`);
    stateErr.code =
      stateVerification.code ||
      (isCrossTenant
        ? 'CROSS_TENANT_STATE_MISMATCH'
        : isExpired
        ? 'OAUTH_STATE_EXPIRED'
        : 'INVALID_OAUTH_STATE');
    stateErr.status =
      stateErr.code === 'OAUTH_STATE_STORE_UNAVAILABLE'
        ? 503
        : stateErr.code === 'CROSS_TENANT_STATE_MISMATCH'
        ? 403
        : 400;
    throw stateErr;
  }

  // Strictly bind tenant from cryptographically verified state (never from untrusted query params)
  const sellerId = stateVerification.tenantId;
  const storeId =
    tenant && tenant.storeId !== undefined
      ? tenant.storeId
        ? tenant.storeId.toString()
        : null
      : stateVerification.storeId || null;

  if (!spapi_oauth_code || typeof spapi_oauth_code !== 'string') {
    const err = new Error('Missing spapi_oauth_code parameter in Amazon OAuth callback.');
    err.code = 'MISSING_OAUTH_CODE';
    err.status = 400;
    throw err;
  }

  const redirectUri = (
    options.redirectUri ||
    config.amazon?.redirectUri ||
    process.env.AMAZON_SP_API_REDIRECT_URI ||
    ''
  ).trim();

  // 2. Exchange spapi_oauth_code for LWA Refresh Token using exact matching redirect_uri
  const exchangeFn = options.exchangeLwaAuthCode || exchangeLwaAuthCode;
  const tokenExchange = await exchangeFn(spapi_oauth_code, {
    ...(redirectUri ? { redirectUri } : {}),
  });

  if (!tokenExchange.success || !tokenExchange.refreshToken) {
    const err = new Error(`Failed to exchange authorization code: ${tokenExchange.message || 'LWA error'}`);
    err.code = tokenExchange.code || 'LWA_EXCHANGE_FAILED';
    err.status = tokenExchange.status || 400;
    throw err;
  }

  // Explicit sandbox default when using Sandbox configuration
  const resolvedEnv =
    (config.amazon?.env || process.env.AMAZON_SP_API_ENV || 'sandbox').toLowerCase().trim() === 'production'
      ? 'production'
      : 'sandbox';
  const resolvedRegion =
    stateVerification.region ||
    (config.amazon?.region || process.env.AMAZON_SP_API_REGION || 'eu').toLowerCase().trim();
  const normalizedRegion = ['eu', 'na', 'fe'].includes(resolvedRegion) ? resolvedRegion : 'eu';
  const expectedMarketplaceId = INDIA_MARKETPLACE_ID;

  // 3. Verify real seller authorization via GET /sellers/v1/marketplaceParticipations BEFORE marking CONNECTED
  const spClient =
    options.spClient ||
    new AmazonSpApiClient({
      sellerId: sellerId.toString(),
      sellingPartnerId: selling_partner_id || null,
      refreshToken: tokenExchange.refreshToken,
      region: normalizedRegion,
      marketplaceId: expectedMarketplaceId,
      sandbox: resolvedEnv === 'sandbox',
    });

  const sellerCheck = await verifyAmazonSellerAuthorization(spClient, {
    expectedMarketplaceId,
    sellingPartnerId: selling_partner_id || '',
    environment: resolvedEnv,
    lwaVerified: true,
    bypassCache: true,
  });

  const isSandboxStaticMock =
    resolvedEnv === 'sandbox' &&
    sellerCheck.verificationMode === AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK &&
    sellerCheck.sandboxTransportVerified === true;

  if (!sellerCheck.verified && !isSandboxStaticMock) {
    evictLwaTokenCache({
      sellerId: sellerId.toString(),
      clientId: config.amazon?.clientId,
      refreshToken: tokenExchange.refreshToken,
    });
    const verifyErr = new Error(sellerCheck.message || 'Amazon seller authorization could not be verified.');
    verifyErr.code = sellerCheck.code || 'SELLER_VERIFICATION_FAILED';
    verifyErr.status = sellerCheck.status || 403;
    verifyErr.verificationMode = sellerCheck.verificationMode || AMAZON_VERIFICATION_MODES.FAILED;
    verifyErr.observedMarketplaceIds = sellerCheck.observedMarketplaceIds || [];
    verifyErr.diagnostics = sellerCheck.diagnostics || null;
    throw verifyErr;
  }

  const verifiedSellingPartnerId = isSandboxStaticMock
    ? (selling_partner_id ? String(selling_partner_id).trim() : '')
    : (sellerCheck.sellingPartnerId || (selling_partner_id ? String(selling_partner_id).trim() : ''));

  const nowDate = new Date();
  const lastVerifiedAt = sellerCheck.lastVerifiedAt ? new Date(sellerCheck.lastVerifiedAt) : nowDate;

  // 4. Encrypt the verified refresh token using AES-256-GCM (12-byte IV)
  const credentialsToStore = {
    refreshToken: tokenExchange.refreshToken,
    sellingPartnerId: verifiedSellingPartnerId,
  };
  const encryptedCredentials = encryptCredentials(credentialsToStore);

  const connectionStatus = sellerCheck.verified ? 'CONNECTED' : 'SANDBOX_TRANSPORT_VERIFIED';

  const payload = {
    sellerId: sellerId.toString(),
    tenantId: sellerId.toString(),
    storeId: storeId ? storeId.toString() : null,
    provider: 'AMAZON',
    channel: 'amazon',
    environment: resolvedEnv,
    type: 'MARKETPLACE',
    status: connectionStatus,
    displayName:
      (!isSandboxStaticMock && sellerCheck.indiaParticipation?.storeName) ||
      (resolvedEnv === 'sandbox' ? 'Amazon Seller Account (Sandbox)' : 'Amazon Seller Account'),
    externalAccountId: verifiedSellingPartnerId,
    sellingPartnerId: verifiedSellingPartnerId,
    marketplaceId: expectedMarketplaceId,
    marketplaceRegion: normalizedRegion,
    credentials: encryptedCredentials,
    authorizedAt: sellerCheck.verified ? nowDate : null,
    tokenUpdatedAt: nowDate,
    lwaVerified: Boolean(sellerCheck.lwaVerified),
    sandboxTransportVerified: Boolean(sellerCheck.sandboxTransportVerified),
    sellerAuthorizationVerified: Boolean(sellerCheck.sellerAuthorizationVerified),
    indiaMarketplaceAuthorized: Boolean(sellerCheck.indiaMarketplaceAuthorized),
    verificationMode: sellerCheck.verificationMode,
    lastVerifiedAt,
    lastError: null,
    errorDetails: null,
    metadata: {
      authorizedMarketplaceIds: sellerCheck.authorizedMarketplaceIds || [],
      observedMarketplaceIds: sellerCheck.observedMarketplaceIds || [],
      hasIndiaMarketplace: Boolean(sellerCheck.indiaMarketplaceAuthorized),
      marketplaceParticipations: sellerCheck.participations || [],
      lwaVerified: Boolean(sellerCheck.lwaVerified),
      sandboxTransportVerified: Boolean(sellerCheck.sandboxTransportVerified),
      sellerAuthorizationVerified: Boolean(sellerCheck.sellerAuthorizationVerified),
      indiaMarketplaceAuthorized: Boolean(sellerCheck.indiaMarketplaceAuthorized),
      verificationMode: sellerCheck.verificationMode,
      lastVerifiedAt: lastVerifiedAt.toISOString(),
      sellerVerifiedAt: sellerCheck.verified ? lastVerifiedAt.toISOString() : null,
      statusMessage: isSandboxStaticMock ? SANDBOX_STATIC_MOCK_MESSAGE : sellerCheck.message,
      lastDiagnostics: sellerCheck.diagnostics || null,
      executionOutcome: sellerCheck.executionOutcome,
    },
  };

  const query = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
  let connection = null;
  try {
    connection = await withDbTimeout(
      ChannelConnection.findOneAndUpdate(
        query,
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      3000
    );
  } catch (dbErr) {
    if (isProductionEnv()) {
      throw createProductionDbError('Amazon OAuth connection');
    }
    console.warn('DB update failed, saving in memory:', dbErr.message);
    const id = new mongoose.Types.ObjectId().toString();
    connection = { _id: id, id, ...payload, createdAt: new Date(), updatedAt: new Date() };
    inMemoryChannelsMap.set(id, connection);
  }

  if (!isProductionEnv() && connection && connection._id) {
    const plain =
      typeof connection.toObject === 'function'
        ? { ...connection.toObject(), credentials: encryptedCredentials }
        : connection;
    inMemoryChannelsMap.set(connection._id.toString(), plain);
  }

  return sanitizeChannelConnection(connection);
};

/**
 * Connect Amazon account via Developer Central Sandbox Self-Authorization (LWA Refresh Token).
 * Verifies BOTH fresh LWA exchange AND Sellers API marketplaceParticipations (India A21TJRUUN4KGV)
 * BEFORE marking the connection CONNECTED.
 */
export const connectAmazonManualService = async (tenant, data, options = {}) => {
  const { sellerId, storeId = null } = tenant;
  const { refreshToken, sellingPartnerId, displayName, marketplaceId, marketplaceRegion } = data;

  if (!refreshToken || !refreshToken.trim()) {
    throw new Error('LWA Refresh Token is required for manual sandbox connection.');
  }

  const cleanRefreshToken = refreshToken.trim();
  const resolvedEnv =
    (data.environment || config.amazon?.env || process.env.AMAZON_SP_API_ENV || 'sandbox').toLowerCase().trim() ===
    'production'
      ? 'production'
      : 'sandbox';
  const mId = (marketplaceId || INDIA_MARKETPLACE_ID).trim();
  const mRegionRaw = (marketplaceRegion || config.amazon?.region || process.env.AMAZON_SP_API_REGION || 'eu')
    .toLowerCase()
    .trim();
  const mRegion = ['eu', 'na', 'fe'].includes(mRegionRaw) ? mRegionRaw : 'eu';

  // 1. Verify token validity with a fresh cache-bypassing LWA exchange
  if (!options.spClient) {
    const authCheck = await handleAmazonAuth({
      sellerId: sellerId.toString(),
      refreshToken: cleanRefreshToken,
      bypassCache: true,
    });
    if (!authCheck.authenticated) {
      const authErr = new Error(`Amazon LWA verification failed: ${authCheck.message}`);
      authErr.code = authCheck.code || 'LWA_EXCHANGE_FAILED';
      authErr.status = authCheck.status || 401;
      throw authErr;
    }
  }

  // 2. Verify actual seller authorization & India marketplace participation via Sellers API
  const spClient =
    options.spClient ||
    new AmazonSpApiClient({
      sellerId: sellerId.toString(),
      sellingPartnerId: sellingPartnerId ? String(sellingPartnerId).trim() : null,
      refreshToken: cleanRefreshToken,
      region: mRegion,
      marketplaceId: mId,
      sandbox: resolvedEnv === 'sandbox',
    });

  const sellerCheck = await verifyAmazonSellerAuthorization(spClient, {
    expectedMarketplaceId: mId,
    sellingPartnerId: sellingPartnerId || '',
    environment: resolvedEnv,
    lwaVerified: true,
    bypassCache: true,
  });

  // In sandbox ONLY, allow confirmed Static Sandbox mock transport verification without claiming real seller authorization
  const isSandboxStaticMock =
    resolvedEnv === 'sandbox' &&
    sellerCheck.verificationMode === AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK &&
    sellerCheck.sandboxTransportVerified === true;

  if (!sellerCheck.verified && !isSandboxStaticMock) {
    evictLwaTokenCache({
      sellerId: sellerId.toString(),
      clientId: config.amazon?.clientId,
      refreshToken: cleanRefreshToken,
    });
    const verifyErr = new Error(sellerCheck.message || 'Amazon seller authorization verification failed.');
    verifyErr.code = sellerCheck.code || 'SELLER_VERIFICATION_FAILED';
    verifyErr.status = sellerCheck.status || 403;
    verifyErr.verificationMode = sellerCheck.verificationMode || AMAZON_VERIFICATION_MODES.FAILED;
    verifyErr.observedMarketplaceIds = sellerCheck.observedMarketplaceIds || [];
    verifyErr.diagnostics = sellerCheck.diagnostics || null;
    throw verifyErr;
  }

  // Never fabricate a seller identity; allow empty sellingPartnerId for transport-only Sandbox testing
  const verifiedSellingPartnerId = isSandboxStaticMock
    ? (sellingPartnerId ? String(sellingPartnerId).trim() : '')
    : (sellerCheck.sellingPartnerId || (sellingPartnerId ? String(sellingPartnerId).trim() : ''));

  const nowDate = new Date();
  const lastVerifiedAt = sellerCheck.lastVerifiedAt ? new Date(sellerCheck.lastVerifiedAt) : nowDate;

  // 3. Encrypt verified refresh token
  const encryptedCredentials = encryptCredentials({
    refreshToken: cleanRefreshToken,
    sellingPartnerId: verifiedSellingPartnerId,
  });

  const connectionStatus = sellerCheck.verified ? 'CONNECTED' : 'SANDBOX_TRANSPORT_VERIFIED';

  const payload = {
    sellerId: sellerId.toString(),
    tenantId: sellerId.toString(),
    storeId: storeId ? storeId.toString() : null,
    provider: 'AMAZON',
    channel: 'amazon',
    environment: resolvedEnv,
    type: 'MARKETPLACE',
    status: connectionStatus,
    displayName:
      displayName ||
      (!isSandboxStaticMock && sellerCheck.indiaParticipation?.storeName) ||
      'Amazon Seller Account (Sandbox)',
    externalAccountId: verifiedSellingPartnerId,
    sellingPartnerId: verifiedSellingPartnerId,
    marketplaceId: mId,
    marketplaceRegion: mRegion,
    credentials: encryptedCredentials,
    authorizedAt: sellerCheck.verified ? nowDate : null,
    tokenUpdatedAt: nowDate,
    lwaVerified: Boolean(sellerCheck.lwaVerified),
    sandboxTransportVerified: Boolean(sellerCheck.sandboxTransportVerified),
    sellerAuthorizationVerified: Boolean(sellerCheck.sellerAuthorizationVerified),
    indiaMarketplaceAuthorized: Boolean(sellerCheck.indiaMarketplaceAuthorized),
    verificationMode: sellerCheck.verificationMode,
    lastVerifiedAt,
    lastError: null,
    errorDetails: null,
    metadata: {
      authorizedMarketplaceIds: sellerCheck.authorizedMarketplaceIds || [],
      observedMarketplaceIds: sellerCheck.observedMarketplaceIds || [],
      hasIndiaMarketplace: Boolean(sellerCheck.indiaMarketplaceAuthorized),
      marketplaceParticipations: sellerCheck.participations || [],
      lwaVerified: Boolean(sellerCheck.lwaVerified),
      sandboxTransportVerified: Boolean(sellerCheck.sandboxTransportVerified),
      sellerAuthorizationVerified: Boolean(sellerCheck.sellerAuthorizationVerified),
      indiaMarketplaceAuthorized: Boolean(sellerCheck.indiaMarketplaceAuthorized),
      verificationMode: sellerCheck.verificationMode,
      lastVerifiedAt: lastVerifiedAt.toISOString(),
      sellerVerifiedAt: sellerCheck.verified ? lastVerifiedAt.toISOString() : null,
      statusMessage: isSandboxStaticMock ? SANDBOX_STATIC_MOCK_MESSAGE : sellerCheck.message,
      lastDiagnostics: sellerCheck.diagnostics || null,
      executionOutcome: sellerCheck.executionOutcome,
    },
  };

  const query = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
  let connection = null;
  try {
    connection = await withDbTimeout(
      ChannelConnection.findOneAndUpdate(
        query,
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      3000
    );
  } catch (dbErr) {
    if (isProductionEnv()) {
      throw createProductionDbError('Amazon manual connection');
    }
    console.warn('DB update failed, saving in memory:', dbErr.message);
    const id = new mongoose.Types.ObjectId().toString();
    connection = { _id: id, id, ...payload, createdAt: new Date(), updatedAt: new Date() };
    inMemoryChannelsMap.set(id, connection);
  }

  if (!isProductionEnv() && connection && connection._id) {
    const plain =
      typeof connection.toObject === 'function'
        ? { ...connection.toObject(), credentials: encryptedCredentials }
        : connection;
    inMemoryChannelsMap.set(connection._id.toString(), plain);
  }

  return sanitizeChannelConnection(connection);
};

/**
 * Get Amazon connection status and metadata
 */
export const getAmazonConnectionStatusService = async (sellerIdInput) => {
  const sellerId = typeof sellerIdInput === 'object' && sellerIdInput !== null
    ? sellerIdInput.sellerId || sellerIdInput.id || sellerIdInput._id
    : sellerIdInput;
  const storeId = typeof sellerIdInput === 'object' && sellerIdInput !== null
    ? sellerIdInput.storeId || null
    : null;

  const query = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
  let conn = null;
  try {
    conn = await withDbTimeout(ChannelConnection.findOne(query), 3000);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('Amazon connection status');
    }
    console.warn('DB lookup failed:', err.message);
  }

  if (!conn && !isProductionEnv()) {
    conn = Array.from(inMemoryChannelsMap.values()).find(
      (c) =>
        matchesTenantStore(c, { sellerId, storeId }) &&
        (c.provider === 'AMAZON' || c.channel === 'amazon')
    );
  }

  if (!conn) {
    return {
      connected: false,
      status: 'NOT_CONFIGURED',
      provider: 'AMAZON',
      channel: 'amazon',
      environment: config.amazon?.env || 'sandbox',
      marketplaceId: 'A21TJRUUN4KGV',
      marketplaceRegion: config.amazon?.region || 'eu',
      lwaVerified: false,
      sandboxTransportVerified: false,
      sellerAuthorizationVerified: false,
      indiaMarketplaceAuthorized: false,
      verificationMode: null,
      lastVerifiedAt: null,
    };
  }

  const meta = conn.metadata || {};
  const lwaVerified =
    conn.lwaVerified !== undefined ? Boolean(conn.lwaVerified) : Boolean(meta.lwaVerified);
  const sandboxTransportVerified =
    conn.sandboxTransportVerified !== undefined
      ? Boolean(conn.sandboxTransportVerified)
      : Boolean(meta.sandboxTransportVerified);
  const sellerAuthorizationVerified =
    conn.sellerAuthorizationVerified !== undefined
      ? Boolean(conn.sellerAuthorizationVerified)
      : meta.sellerAuthorizationVerified !== undefined
      ? Boolean(meta.sellerAuthorizationVerified)
      : conn.status === 'CONNECTED';
  const indiaMarketplaceAuthorized =
    conn.indiaMarketplaceAuthorized !== undefined
      ? Boolean(conn.indiaMarketplaceAuthorized)
      : Boolean(meta.indiaMarketplaceAuthorized ?? meta.hasIndiaMarketplace);
  const verificationMode = conn.verificationMode ?? meta.verificationMode ?? null;
  const lastVerifiedAt = conn.lastVerifiedAt || meta.lastVerifiedAt || null;

  return {
    connected: conn.status === 'CONNECTED',
    status: conn.status,
    channelId: conn._id ? conn._id.toString() : conn.id,
    displayName: conn.displayName,
    sellingPartnerId: conn.sellingPartnerId || conn.externalAccountId || null,
    marketplaceId: conn.marketplaceId || 'A21TJRUUN4KGV',
    marketplaceRegion: conn.marketplaceRegion || 'eu',
    environment: conn.environment || config.amazon?.env || 'sandbox',
    channel: conn.channel || 'amazon',
    provider: conn.provider || 'AMAZON',
    authorizedAt: conn.authorizedAt || null,
    tokenUpdatedAt: conn.tokenUpdatedAt || null,
    lwaVerified,
    sandboxTransportVerified,
    sellerAuthorizationVerified,
    indiaMarketplaceAuthorized,
    verificationMode,
    lastVerifiedAt,
    lastSyncAt: conn.lastSyncAt || null,
    lastSuccessfulSyncAt: conn.lastSuccessfulSyncAt || null,
    lastError: conn.lastError || null,
    metadata: meta,
  };
};

/**
 * Disconnect Amazon integration, evict tenant LWA token cache, and purge stored credentials
 */
export const disconnectAmazonService = async (sellerIdInput) => {
  const sellerId = typeof sellerIdInput === 'object' && sellerIdInput !== null
    ? sellerIdInput.sellerId || sellerIdInput.id || sellerIdInput._id
    : sellerIdInput;
  const storeId = typeof sellerIdInput === 'object' && sellerIdInput !== null
    ? sellerIdInput.storeId || null
    : null;

  const query = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
  let conn = null;
  try {
    conn = await ChannelConnection.findOne(query);
    if (conn) {
      evictConnectionLwaCache(conn, sellerId);
      conn.status = 'DISCONNECTED';
      conn.credentials = null;
      conn.authorizedAt = null;
      conn.lwaVerified = false;
      conn.sandboxTransportVerified = false;
      conn.sellerAuthorizationVerified = false;
      conn.indiaMarketplaceAuthorized = false;
      conn.verificationMode = null;
      conn.lastVerifiedAt = null;
      conn.lastError = null;
      conn.metadata = {
        ...(conn.metadata || {}),
        lwaVerified: false,
        sandboxTransportVerified: false,
        sellerAuthorizationVerified: false,
        indiaMarketplaceAuthorized: false,
        verificationMode: null,
        lastVerifiedAt: null,
      };
      await conn.save();

      // Always keep local memory cache in sync (never leave stale CONNECTED entry)
      for (const memConn of inMemoryChannelsMap.values()) {
        if (
          matchesTenantStore(memConn, { sellerId, storeId }) &&
          (memConn.provider === 'AMAZON' || memConn.channel === 'amazon')
        ) {
          evictConnectionLwaCache(memConn, sellerId);
          memConn.status = 'DISCONNECTED';
          memConn.credentials = null;
          memConn.authorizedAt = null;
          memConn.lwaVerified = false;
          memConn.sandboxTransportVerified = false;
          memConn.sellerAuthorizationVerified = false;
          memConn.indiaMarketplaceAuthorized = false;
          memConn.verificationMode = null;
          memConn.lastVerifiedAt = null;
          memConn.lastError = null;
        }
      }

      return sanitizeChannelConnection(conn);
    }
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('Amazon disconnect');
    }
    console.warn('DB disconnect error:', err.message);
  }

  if (!isProductionEnv()) {
    const memConn = Array.from(inMemoryChannelsMap.values()).find(
      (c) =>
        matchesTenantStore(c, { sellerId, storeId }) &&
        (c.provider === 'AMAZON' || c.channel === 'amazon')
    );
    if (memConn) {
      evictConnectionLwaCache(memConn, sellerId);
      memConn.status = 'DISCONNECTED';
      memConn.credentials = null;
      memConn.authorizedAt = null;
      memConn.lwaVerified = false;
      memConn.sandboxTransportVerified = false;
      memConn.sellerAuthorizationVerified = false;
      memConn.indiaMarketplaceAuthorized = false;
      memConn.verificationMode = null;
      memConn.lastVerifiedAt = null;
      memConn.lastError = null;
      return sanitizeChannelConnection(memConn);
    }
  }

  // Even if record was absent, evict any orphaned LWA cache entry for this seller
  evictLwaTokenCache({ sellerId });
  throw new Error('Amazon connection not found for this seller');
};

/**
 * Test Amazon connection live against SP-API LWA (bypassing cache) AND Sellers API marketplaceParticipations.
 * Never marks CONNECTED unless both LWA exchange AND seller marketplace authorization succeed.
 */
export const testAmazonConnectionService = async (sellerIdInput, options = {}) => {
  const sellerId = typeof sellerIdInput === 'object' && sellerIdInput !== null
    ? sellerIdInput.sellerId || sellerIdInput.id || sellerIdInput._id
    : sellerIdInput;
  const storeId = typeof sellerIdInput === 'object' && sellerIdInput !== null
    ? sellerIdInput.storeId || null
    : null;

  const query = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId);
  let conn = null;
  try {
    conn = await ChannelConnection.findOne(query);
  } catch (err) {
    if (isProductionEnv()) {
      throw createProductionDbError('Amazon connection test');
    }
    console.warn('DB lookup error:', err.message);
  }

  if (!conn && !isProductionEnv()) {
    conn = Array.from(inMemoryChannelsMap.values()).find(
      (c) =>
        matchesTenantStore(c, { sellerId, storeId }) &&
        (c.provider === 'AMAZON' || c.channel === 'amazon')
    );
  }

  if (!conn || conn.status === 'DISCONNECTED' || !conn.credentials) {
    return {
      success: false,
      authenticated: false,
      sellerAuthorized: false,
      message: 'Amazon connection is not configured or credentials are missing.',
      code: 'NOT_CONNECTED',
    };
  }

  const decrypted = decryptCredentials(conn.credentials);
  if (!decrypted || !decrypted.refreshToken) {
    return {
      success: false,
      authenticated: false,
      sellerAuthorized: false,
      message: 'Could not decrypt Amazon credentials or refresh token is missing.',
      code: 'DECRYPTION_FAILED',
    };
  }

  // 1. Fresh cache-bypassing LWA token exchange
  let authResult = { authenticated: true, expiresAt: null };
  if (!options.spClient) {
    authResult = await handleAmazonAuth({
      sellerId: sellerId ? sellerId.toString() : null,
      refreshToken: decrypted.refreshToken,
      bypassCache: true,
    });

    if (!authResult.authenticated) {
      const isRevokedOrUnauthorized =
        authResult.status === 401 ||
        authResult.code === 'invalid_grant' ||
        authResult.code === 'UNAUTHORIZED' ||
        authResult.code === 'LWA_UNAUTHORIZED';
      const failedAt = new Date();
      conn.status = isRevokedOrUnauthorized ? 'REAUTH_REQUIRED' : 'ERROR';
      conn.lwaVerified = false;
      conn.sandboxTransportVerified = false;
      conn.sellerAuthorizationVerified = false;
      conn.indiaMarketplaceAuthorized = false;
      conn.verificationMode = AMAZON_VERIFICATION_MODES.FAILED;
      conn.lastVerifiedAt = failedAt;
      conn.lastError = authResult.message;
      conn.metadata = {
        ...(conn.metadata || {}),
        lwaVerified: false,
        sandboxTransportVerified: false,
        sellerAuthorizationVerified: false,
        indiaMarketplaceAuthorized: false,
        verificationMode: AMAZON_VERIFICATION_MODES.FAILED,
        lastVerifiedAt: failedAt.toISOString(),
        executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      };
      evictLwaTokenCache({
        sellerId: sellerId ? sellerId.toString() : null,
        clientId: config.amazon?.clientId,
        refreshToken: decrypted.refreshToken,
      });
      try {
        if (typeof conn.save === 'function') await conn.save();
      } catch {
        if (isProductionEnv()) throw createProductionDbError('Amazon connection status save');
      }
      return {
        success: false,
        authenticated: false,
        sellerAuthorized: false,
        lwaVerified: false,
        sandboxTransportVerified: false,
        sellerAuthorizationVerified: false,
        indiaMarketplaceAuthorized: false,
        verificationMode: AMAZON_VERIFICATION_MODES.FAILED,
        lastVerifiedAt: failedAt.toISOString(),
        code: authResult.code || 'LWA_EXCHANGE_FAILED',
        message: authResult.message,
        status: conn.status,
        executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      };
    }
  }

  // 2. Live Sellers API verification (GET /sellers/v1/marketplaceParticipations)
  const expectedMarketplaceId = conn.marketplaceId || INDIA_MARKETPLACE_ID;
  const resolvedEnv = (conn.environment || config.amazon?.env || 'sandbox') === 'production' ? 'production' : 'sandbox';
  const spClient =
    options.spClient ||
    new AmazonSpApiClient({
      sellerId: sellerId ? sellerId.toString() : null,
      sellingPartnerId: conn.sellingPartnerId || conn.externalAccountId || decrypted.sellingPartnerId || null,
      refreshToken: decrypted.refreshToken,
      region: conn.marketplaceRegion || config.amazon?.region || 'eu',
      marketplaceId: expectedMarketplaceId,
      sandbox: resolvedEnv === 'sandbox',
    });

  const sellerCheck = await verifyAmazonSellerAuthorization(spClient, {
    expectedMarketplaceId,
    sellingPartnerId: conn.sellingPartnerId || conn.externalAccountId || decrypted.sellingPartnerId || '',
    environment: resolvedEnv,
    lwaVerified: true,
    bypassCache: true,
  });

  const isSandboxStaticMock =
    resolvedEnv === 'sandbox' &&
    sellerCheck.verificationMode === AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK &&
    sellerCheck.sandboxTransportVerified === true;

  const lastVerifiedAt = sellerCheck.lastVerifiedAt ? new Date(sellerCheck.lastVerifiedAt) : new Date();

  if (sellerCheck.verified) {
    conn.status = 'CONNECTED';
    conn.lastError = null;
    conn.tokenUpdatedAt = new Date();
    conn.authorizedAt = conn.authorizedAt || new Date();
    conn.lwaVerified = true;
    conn.sandboxTransportVerified = Boolean(sellerCheck.sandboxTransportVerified);
    conn.sellerAuthorizationVerified = true;
    conn.indiaMarketplaceAuthorized = Boolean(sellerCheck.indiaMarketplaceAuthorized);
    conn.verificationMode = AMAZON_VERIFICATION_MODES.REAL_SELLER_AUTHORIZED;
    conn.lastVerifiedAt = lastVerifiedAt;
    if (sellerCheck.sellingPartnerId && !conn.sellingPartnerId) {
      conn.sellingPartnerId = sellerCheck.sellingPartnerId;
      conn.externalAccountId = sellerCheck.sellingPartnerId;
    }
    conn.metadata = {
      ...(conn.metadata || {}),
      authorizedMarketplaceIds: sellerCheck.authorizedMarketplaceIds,
      observedMarketplaceIds: sellerCheck.observedMarketplaceIds || sellerCheck.authorizedMarketplaceIds,
      hasIndiaMarketplace: Boolean(sellerCheck.indiaMarketplaceAuthorized),
      marketplaceParticipations: sellerCheck.participations,
      lwaVerified: true,
      sandboxTransportVerified: Boolean(sellerCheck.sandboxTransportVerified),
      sellerAuthorizationVerified: true,
      indiaMarketplaceAuthorized: Boolean(sellerCheck.indiaMarketplaceAuthorized),
      verificationMode: AMAZON_VERIFICATION_MODES.REAL_SELLER_AUTHORIZED,
      lastVerifiedAt: lastVerifiedAt.toISOString(),
      sellerVerifiedAt: lastVerifiedAt.toISOString(),
      statusMessage: sellerCheck.message,
      lastDiagnostics: sellerCheck.diagnostics || null,
      executionOutcome: sellerCheck.executionOutcome,
    };
  } else if (isSandboxStaticMock) {
    conn.status = 'SANDBOX_TRANSPORT_VERIFIED';
    conn.lastError = null;
    conn.tokenUpdatedAt = new Date();
    conn.authorizedAt = null;
    conn.lwaVerified = true;
    conn.sandboxTransportVerified = true;
    conn.sellerAuthorizationVerified = false;
    conn.indiaMarketplaceAuthorized = false;
    conn.verificationMode = AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK;
    conn.lastVerifiedAt = lastVerifiedAt;
    conn.metadata = {
      ...(conn.metadata || {}),
      authorizedMarketplaceIds: [],
      observedMarketplaceIds: sellerCheck.observedMarketplaceIds || [],
      hasIndiaMarketplace: false,
      marketplaceParticipations: sellerCheck.participations || [],
      lwaVerified: true,
      sandboxTransportVerified: true,
      sellerAuthorizationVerified: false,
      indiaMarketplaceAuthorized: false,
      verificationMode: AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK,
      lastVerifiedAt: lastVerifiedAt.toISOString(),
      sellerVerifiedAt: null,
      statusMessage: SANDBOX_STATIC_MOCK_MESSAGE,
      lastDiagnostics: sellerCheck.diagnostics || null,
      executionOutcome: sellerCheck.executionOutcome,
    };
  } else {
    conn.status =
      sellerCheck.code === 'LWA_UNAUTHORIZED' || sellerCheck.code === 'SP_API_FORBIDDEN'
        ? 'REAUTH_REQUIRED'
        : 'ERROR';
    conn.lastError = sellerCheck.message;
    conn.lwaVerified = Boolean(sellerCheck.lwaVerified);
    conn.sandboxTransportVerified = false;
    conn.sellerAuthorizationVerified = false;
    conn.indiaMarketplaceAuthorized = false;
    conn.verificationMode = sellerCheck.verificationMode || AMAZON_VERIFICATION_MODES.FAILED;
    conn.lastVerifiedAt = lastVerifiedAt;
    conn.metadata = {
      ...(conn.metadata || {}),
      observedMarketplaceIds: sellerCheck.observedMarketplaceIds || [],
      marketplaceParticipations: sellerCheck.participations || [],
      lwaVerified: Boolean(sellerCheck.lwaVerified),
      sandboxTransportVerified: false,
      sellerAuthorizationVerified: false,
      indiaMarketplaceAuthorized: false,
      verificationMode: sellerCheck.verificationMode || AMAZON_VERIFICATION_MODES.FAILED,
      lastVerifiedAt: lastVerifiedAt.toISOString(),
      lastDiagnostics: sellerCheck.diagnostics || null,
      executionOutcome: sellerCheck.executionOutcome,
    };
  }

  try {
    if (typeof conn.save === 'function') await conn.save();
  } catch (e) {
    if (isProductionEnv()) {
      throw createProductionDbError('Amazon connection status save');
    }
  }

  return {
    success: sellerCheck.verified || isSandboxStaticMock,
    authenticated: Boolean(sellerCheck.lwaVerified),
    sellerAuthorized: sellerCheck.verified,
    lwaVerified: Boolean(sellerCheck.lwaVerified),
    sandboxTransportVerified: Boolean(sellerCheck.sandboxTransportVerified),
    sellerAuthorizationVerified: Boolean(sellerCheck.sellerAuthorizationVerified),
    indiaMarketplaceAuthorized: Boolean(sellerCheck.indiaMarketplaceAuthorized),
    verificationMode: sellerCheck.verificationMode,
    lastVerifiedAt: lastVerifiedAt.toISOString(),
    code: sellerCheck.code,
    message: sellerCheck.verified
      ? `Amazon SP-API ${resolvedEnv === 'sandbox' ? 'Sandbox' : 'Production'} LWA and seller authorization verified for marketplace ${expectedMarketplaceId}.`
      : isSandboxStaticMock
      ? SANDBOX_STATIC_MOCK_MESSAGE
      : sellerCheck.message,
    status: conn.status,
    sellingPartnerId: isSandboxStaticMock
      ? (conn.sellingPartnerId || null)
      : (sellerCheck.sellingPartnerId || conn.sellingPartnerId || null),
    marketplaceId: expectedMarketplaceId,
    authorizedMarketplaceIds: sellerCheck.authorizedMarketplaceIds || [],
    observedMarketplaceIds: sellerCheck.observedMarketplaceIds || [],
    hasIndiaMarketplace: Boolean(sellerCheck.indiaMarketplaceAuthorized),
    diagnostics: sellerCheck.diagnostics || null,
    executionOutcome: sellerCheck.executionOutcome,
    expiresAt: authResult.expiresAt || null,
  };
};

