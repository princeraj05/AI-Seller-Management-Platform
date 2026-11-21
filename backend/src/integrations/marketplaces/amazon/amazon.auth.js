import crypto from 'crypto';
import { config } from '../../../config/env.js';

// In-memory cache for LWA access tokens to avoid redundant token exchanges.
// Keyed strictly by SHA-256 of the full clientId + refreshToken (+ optional tenant scope)
// so two tenants sharing the same token prefix can NEVER collide.
const lwaTokenCache = new Map();
// Secondary index: tenantId -> Set<cacheKey> for safe per-tenant eviction on disconnect
const tenantTokenCacheIndex = new Map();

/**
 * Compute collision-resistant SHA-256 cache key from full clientId, full refreshToken,
 * and optional tenant scope.
 *
 * @param {string} clientId
 * @param {string} refreshToken
 * @param {string|null} [tenantId=null]
 * @returns {string}
 */
export const computeLwaCacheKey = (clientId, refreshToken, tenantId = null) => {
  const scope = tenantId ? String(tenantId).trim() : '';
  return crypto
    .createHash('sha256')
    .update(`lwa-v2|${scope}|${String(clientId || '')}|${String(refreshToken || '')}`)
    .digest('hex');
};

/**
 * Clear entire LWA token cache (intended for unit tests only).
 */
export const clearLwaTokenCache = () => {
  lwaTokenCache.clear();
  tenantTokenCacheIndex.clear();
};

/**
 * Safely evict LWA cached access token(s) for a specific tenant and/or refreshToken
 * without affecting any other tenant's cached tokens.
 *
 * @param {Object} [params]
 * @param {string|null} [params.sellerId]
 * @param {string|null} [params.tenantId]
 * @param {string|null} [params.clientId]
 * @param {string|null} [params.refreshToken]
 * @returns {number} number of cache entries removed
 */
export const evictLwaTokenCache = ({ sellerId = null, tenantId = null, clientId = null, refreshToken = null } = {}) => {
  let evicted = 0;
  const effectiveTenant = sellerId || tenantId ? String(sellerId || tenantId).trim() : null;

  if (effectiveTenant && tenantTokenCacheIndex.has(effectiveTenant)) {
    const keys = tenantTokenCacheIndex.get(effectiveTenant);
    for (const key of keys) {
      if (lwaTokenCache.delete(key)) {
        evicted++;
      }
    }
    tenantTokenCacheIndex.delete(effectiveTenant);
  }

  if (refreshToken) {
    const resolvedClientId = clientId || config.amazon?.clientId || process.env.AMAZON_SP_API_CLIENT_ID || '';
    const candidateKeys = new Set([
      computeLwaCacheKey(resolvedClientId, refreshToken, effectiveTenant),
      computeLwaCacheKey(resolvedClientId, refreshToken, null),
    ]);
    for (const key of candidateKeys) {
      if (lwaTokenCache.delete(key)) {
        evicted++;
      }
    }
  }

  return evicted;
};

/**
 * Handle Amazon Login with Amazon (LWA) token exchange.
 * Exchanges a tenant-specific seller-authorized Refresh Token for an Access Token.
 * NEVER falls back to a global AMAZON_SP_API_REFRESH_TOKEN environment variable.
 *
 * @param {Object} credentials
 * @param {string} [credentials.clientId]
 * @param {string} [credentials.clientSecret]
 * @param {string} [credentials.refreshToken]
 * @param {string} [credentials.sellerId]
 * @param {string} [credentials.tenantId]
 * @param {string} [credentials.lwaEndpoint]
 * @returns {Promise<{authenticated: boolean, accessToken?: string, expiresIn?: number, expiresAt?: number, message?: string, requiresSellerAuth?: boolean, code?: string}>}
 */
export const handleAmazonAuth = async (credentials = {}) => {
  const clientId =
    credentials.clientId !== undefined
      ? credentials.clientId
      : config.amazon?.clientId || process.env.AMAZON_SP_API_CLIENT_ID;

  const clientSecret =
    credentials.clientSecret !== undefined
      ? credentials.clientSecret
      : config.amazon?.clientSecret || process.env.AMAZON_SP_API_CLIENT_SECRET;

  // Strictly require an explicit per-tenant refresh token; NEVER fall back to global env token
  const refreshToken =
    typeof credentials.refreshToken === 'string' ? credentials.refreshToken.trim() : '';

  const tenantScope = credentials.sellerId || credentials.tenantId
    ? String(credentials.sellerId || credentials.tenantId).trim()
    : null;

  const lwaEndpoint = credentials.lwaEndpoint || config.amazon?.lwaEndpoint || 'https://api.amazon.com/auth/o2/token';

  // 1. Verify App Client credentials are present
  if (!clientId || !clientSecret) {
    return {
      authenticated: false,
      message: 'Amazon SP-API LWA Client Identifier and Client Secret are required in environment configuration.',
      code: 'MISSING_APP_CREDENTIALS',
    };
  }

  // 2. Verify Seller-authorized Refresh Token is present
  if (!refreshToken) {
    return {
      authenticated: false,
      message: 'Amazon SP-API requires a seller-authorized LWA Refresh Token. Please complete Seller Central authorization to obtain a refresh token.',
      requiresSellerAuth: true,
      code: 'SELLER_AUTH_REQUIRED',
    };
  }

  // 3. Check in-memory cache using full SHA-256 key (unless bypassCache is explicitly requested)
  const bypassCache = credentials.bypassCache === true;
  const cacheKey = computeLwaCacheKey(clientId, refreshToken, tenantScope);
  const cached = !bypassCache ? lwaTokenCache.get(cacheKey) : null;

  if (cached && Date.now() < cached.expiresAt) {
    return {
      authenticated: true,
      accessToken: cached.accessToken,
      tokenType: cached.tokenType,
      expiresIn: Math.round((cached.expiresAt - Date.now()) / 1000),
      expiresAt: cached.expiresAt,
      isCached: true,
    };
  }

  // 4. Perform secure LWA token exchange with https://api.amazon.com/auth/o2/token
  try {
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(lwaEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json',
        'User-Agent': 'AISellerManagementPlatform/1.0 (Language=Node.js)',
      },
      body: bodyParams.toString(),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const sanitizedError = data.error_description || data.error || `HTTP ${response.status} from LWA service`;
      return {
        authenticated: false,
        message: `LWA token exchange failed: ${sanitizedError}`,
        code: data.error || 'LWA_EXCHANGE_FAILED',
        status: response.status,
      };
    }

    if (!data.access_token) {
      return {
        authenticated: false,
        message: 'LWA service responded without an access token.',
        code: 'MISSING_ACCESS_TOKEN',
      };
    }

    const expiresIn = Number(data.expires_in) || 3600;
    // Buffer expiration by 5 minutes (300 seconds) without extending sub-60s TTLs
    const bufferedSeconds = expiresIn > 300 ? expiresIn - 300 : Math.max(Math.floor(expiresIn / 2), 1);
    const expiresAt = Date.now() + bufferedSeconds * 1000;

    const authResult = {
      authenticated: true,
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      expiresIn,
      expiresAt,
      isCached: false,
    };

    // Cache the verified token under full SHA-256 key and index by tenant for eviction
    lwaTokenCache.set(cacheKey, {
      accessToken: data.access_token,
      expiresAt,
      tokenType: data.token_type || 'bearer',
      tenantScope,
    });

    if (tenantScope) {
      if (!tenantTokenCacheIndex.has(tenantScope)) {
        tenantTokenCacheIndex.set(tenantScope, new Set());
      }
      tenantTokenCacheIndex.get(tenantScope).add(cacheKey);
    }

    return authResult;
  } catch (error) {
    return {
      authenticated: false,
      message: `LWA connection error: ${error.message || 'Unable to reach Amazon auth service'}`,
      code: 'NETWORK_ERROR',
    };
  }
};

/**
 * Exchange an Amazon SP-API OAuth authorization code (spapi_oauth_code) for an LWA Refresh Token
 *
 * @param {string} authCode The spapi_oauth_code returned by Amazon Seller Central OAuth callback
 * @param {Object} [options]
 * @param {string} [options.clientId]
 * @param {string} [options.clientSecret]
 * @param {string} [options.lwaEndpoint]
 * @returns {Promise<{success: boolean, refreshToken?: string, accessToken?: string, expiresIn?: number, message?: string, code?: string}>}
 */
export const exchangeLwaAuthCode = async (authCode, options = {}) => {
  const clientId = options.clientId || config.amazon?.clientId || process.env.AMAZON_SP_API_CLIENT_ID;
  const clientSecret = options.clientSecret || config.amazon?.clientSecret || process.env.AMAZON_SP_API_CLIENT_SECRET;
  const lwaEndpoint = options.lwaEndpoint || config.amazon?.lwaEndpoint || 'https://api.amazon.com/auth/o2/token';
  const redirectUri = options.redirectUri || config.amazon?.redirectUri || process.env.AMAZON_SP_API_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    return {
      success: false,
      message: 'Amazon SP-API LWA Client Identifier and Client Secret are not configured in environment.',
      code: 'MISSING_APP_CREDENTIALS',
    };
  }

  if (!authCode) {
    return {
      success: false,
      message: 'Authorization code (spapi_oauth_code) is required for LWA token exchange.',
      code: 'MISSING_AUTH_CODE',
    };
  }

  try {
    const payload = {
      grant_type: 'authorization_code',
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
    };
    if (redirectUri) {
      payload.redirect_uri = redirectUri;
    }
    const bodyParams = new URLSearchParams(payload);

    const response = await fetch(lwaEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json',
        'User-Agent': 'AISellerManagementPlatform/1.0 (Language=Node.js)',
      },
      body: bodyParams.toString(),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const sanitizedError = data.error_description || data.error || `HTTP ${response.status} from LWA service`;
      return {
        success: false,
        message: `LWA authorization code exchange failed: ${sanitizedError}`,
        code: data.error || 'LWA_EXCHANGE_FAILED',
        status: response.status,
      };
    }

    if (!data.refresh_token) {
      return {
        success: false,
        message: 'LWA service responded without a refresh token.',
        code: 'MISSING_REFRESH_TOKEN',
      };
    }

    return {
      success: true,
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiresIn: Number(data.expires_in) || 3600,
    };
  } catch (error) {
    return {
      success: false,
      message: `LWA connection error: ${error.message || 'Unable to reach Amazon auth service'}`,
      code: 'NETWORK_ERROR',
    };
  }
};
