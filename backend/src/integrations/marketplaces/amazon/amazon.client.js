import { config, resolveSpApiEndpoint } from '../../../config/env.js';
import { handleAmazonAuth, evictLwaTokenCache } from './amazon.auth.js';
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  calculateBackoffDelay,
  parseRateLimitHeaders,
  sleep,
} from './amazon.rateLimiter.js';

export const AMAZON_EXECUTION_OUTCOMES = Object.freeze({
  MOCK: 'MOCK',
  DRY_RUN: 'DRY_RUN',
  SANDBOX_HTTP_SUCCESS: 'SANDBOX_HTTP_SUCCESS',
  SANDBOX_HTTP_FAILURE: 'SANDBOX_HTTP_FAILURE',
});

/**
 * Strip any potentially sensitive fields from upstream SP-API error objects before attaching/returning.
 */
const sanitizeApiErrorPayload = (data) => {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.errors)) {
    return {
      errors: data.errors.map((e) => ({
        code: e.code || null,
        message: e.message || null,
        details: typeof e.details === 'string' ? e.details.slice(0, 300) : undefined,
      })),
    };
  }
  return {
    code: data.code || data.error || null,
    message: data.message || data.error_description || null,
  };
};

export class AmazonSpApiClient {
  /**
   * @param {Object} credentials
   * @param {string} [credentials.clientId]
   * @param {string} [credentials.clientSecret]
   * @param {string} [credentials.refreshToken]
   * @param {string} [credentials.sellerId]
   * @param {string} [credentials.sellingPartnerId]
   * @param {string} [credentials.region] 'eu' (default for India), 'na', 'fe'
   * @param {boolean} [credentials.sandbox]
   * @param {Object} [credentials.rateLimitConfig]
   */
  constructor(credentials = {}) {
    this.region = (
      credentials.region ||
      config.amazon?.region ||
      process.env.AMAZON_SP_API_REGION ||
      'eu'
    ).toLowerCase().trim();

    this.isSandbox =
      credentials.sandbox !== undefined
        ? Boolean(credentials.sandbox)
        : (config.amazon?.env || process.env.AMAZON_SP_API_ENV || 'sandbox') === 'sandbox';

    // Strictly per-tenant refresh token: NEVER fall back to global AMAZON_SP_API_REFRESH_TOKEN
    const tenantRefreshToken =
      typeof credentials.refreshToken === 'string' ? credentials.refreshToken.trim() : '';

    this.credentials = {
      ...credentials,
      clientId: credentials.clientId || config.amazon?.clientId || process.env.AMAZON_SP_API_CLIENT_ID,
      clientSecret: credentials.clientSecret || config.amazon?.clientSecret || process.env.AMAZON_SP_API_CLIENT_SECRET,
      appId: credentials.appId || config.amazon?.appId || process.env.AMAZON_SP_API_APP_ID,
      refreshToken: tenantRefreshToken,
      sellerId: credentials.sellerId || credentials.tenantId || null,
      sellingPartnerId: credentials.sellingPartnerId || null,
      region: this.region,
      sandbox: this.isSandbox,
    };

    // Region-aware endpoint (EU for India-first: sandbox.sellingpartnerapi-eu.amazon.com)
    this.baseUrl = resolveSpApiEndpoint(this.region, this.isSandbox ? 'sandbox' : 'production');

    // Amazon-specific rate limit and retry configuration
    this.rateLimitConfig = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...(credentials.rateLimitConfig || {}),
    };

    // Telemetry tracking for rate limit headers & structured diagnostics
    this.lastRateLimit = null;
    this.lastRetryAfter = null;
    this.lastHttpStatus = null;
    this.lastRequestId = null;
    this.lastDiagnostics = null;
  }

  /**
   * Obtain a valid LWA access token before issuing API requests
   */
  async getAccessToken(authOptions = {}) {
    const auth = await handleAmazonAuth({
      ...this.credentials,
      bypassCache: authOptions.bypassCache === true,
    });
    if (!auth.authenticated) {
      const err = new Error(auth.message || 'LWA authentication failed');
      err.code = auth.code;
      err.status = auth.status || 401;
      err.requiresSellerAuth = auth.requiresSellerAuth;
      throw err;
    }
    return auth.accessToken;
  }

  /**
   * Build a secret-safe structured diagnostic record for an actual HTTP request
   */
  _buildDiagnostics({ httpStatus, endpoint, operation, durationMs, requestId, rateLimit, retryAfter, outcome }) {
    return {
      httpStatus: httpStatus ?? null,
      endpoint,
      operation,
      durationMs,
      requestId: requestId || null,
      rateLimit: rateLimit ?? null,
      retryAfter: retryAfter ?? null,
      region: this.region,
      environment: this.isSandbox ? 'sandbox' : 'production',
      isSandbox: this.isSandbox,
      baseUrl: this.baseUrl,
      outcome,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute an authenticated SP-API request with rate limit handling, header parsing,
   * exponential backoff, and structured secret-safe HTTP diagnostics.
   *
   * @param {string} endpointPath e.g. '/orders/2026-01-01/orders'
   * @param {Object} options fetch options (+ optional `operation`, `bypassCache`)
   */
  async executeRequest(endpointPath, options = {}) {
    const cleanEndpoint = endpointPath.split('?')[0];
    const method = (options.method || 'GET').toUpperCase();
    const operation = options.operation || `${method} ${cleanEndpoint}`;
    const url = `${this.baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;
    const maxRetries = options.maxRetries ?? this.rateLimitConfig.maxRetries;

    let attempt = 0;

    while (true) {
      const accessToken = await this.getAccessToken({
        bypassCache: options.bypassCache === true && attempt === 0,
      });

      const headers = {
        'x-amz-access-token': accessToken,
        'User-Agent': 'AISellerManagementPlatform/1.0 (Language=Node.js)',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {}),
      };

      const requestStartMs = Date.now();

      try {
        const fetchOpts = { ...options, headers };
        delete fetchOpts.operation;
        delete fetchOpts.bypassCache;
        delete fetchOpts.maxRetries;

        const response = await fetch(url, fetchOpts);
        const durationMs = Date.now() - requestStartMs;

        // 1. Parse request ID, rate limit and retry headers
        const requestId =
          response.headers.get('x-amzn-RequestId') ||
          response.headers.get('x-amz-rid') ||
          null;
        this.lastRequestId = requestId;
        this.lastHttpStatus = response.status;

        const { limit, retryAfter } = parseRateLimitHeaders(response);
        if (limit !== null) {
          this.lastRateLimit = limit;
        }
        if (retryAfter !== null) {
          this.lastRetryAfter = retryAfter;
        }

        const outcome = response.ok
          ? AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS
          : AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE;

        const diagnostics = this._buildDiagnostics({
          httpStatus: response.status,
          endpoint: cleanEndpoint,
          operation,
          durationMs,
          requestId,
          rateLimit: limit,
          retryAfter,
          outcome,
        });
        this.lastDiagnostics = diagnostics;

        // Structured, secret-safe diagnostic logging (NEVER logs tokens, secrets, headers, bodies, or PII)
        console.log(
          `[Amazon SP-API Diagnostics] op=${operation} | status=${response.status} | durationMs=${durationMs} | requestId=${requestId || 'N/A'} | endpoint=${cleanEndpoint} | outcome=${outcome}`
        );

        // 2. Handle 401 Unauthorized: Evict ONLY this tenant's cached token and retry once if fresh
        if (response.status === 401) {
          evictLwaTokenCache({
            sellerId: this.credentials.sellerId,
            clientId: this.credentials.clientId,
            refreshToken: this.credentials.refreshToken,
          });
          if (attempt === 0) {
            attempt++;
            continue;
          }
        }

        // 3. Handle 429 Rate Limited: Exponential backoff with jitter and max retries
        if (response.status === 429) {
          if (attempt < maxRetries) {
            const delayMs = calculateBackoffDelay(attempt, retryAfter, this.rateLimitConfig);
            attempt++;
            await sleep(delayMs);
            continue;
          }

          const rateErr = new Error(
            `Amazon SP-API rate limit exceeded for ${cleanEndpoint} (HTTP 429) after ${attempt} retries`
          );
          rateErr.status = 429;
          rateErr.code = 'RATE_LIMITED';
          rateErr.retryAfter = retryAfter;
          rateErr.requestId = requestId;
          rateErr.diagnostics = diagnostics;
          throw rateErr;
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          let errorMsg = `Amazon SP-API Error (${response.status})`;
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            errorMsg = data.errors.map((e) => e.message || e.code).join('; ');
          } else if (data.message) {
            errorMsg = data.message;
          }

          const err = new Error(errorMsg);
          err.status = response.status;
          err.code =
            response.status === 401
              ? 'UNAUTHORIZED'
              : response.status === 403
              ? 'FORBIDDEN'
              : 'API_ERROR';
          err.requestId = requestId;
          err.sanitizedData = sanitizeApiErrorPayload(data);
          err.diagnostics = diagnostics;
          throw err;
        }

        // Attach sanitized request metadata & diagnostics to response object
        if (data && typeof data === 'object') {
          data._metadata = {
            status: response.status,
            requestId,
            rateLimit: limit,
            durationMs,
            operation,
            endpoint: cleanEndpoint,
            outcome,
          };
        }

        return data;
      } catch (error) {
        if (error.code) throw error;
        const durationMs = Date.now() - requestStartMs;
        const diagnostics = this._buildDiagnostics({
          httpStatus: null,
          endpoint: cleanEndpoint,
          operation,
          durationMs,
          requestId: null,
          rateLimit: null,
          retryAfter: null,
          outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
        });
        this.lastDiagnostics = diagnostics;
        const netErr = new Error(`Amazon SP-API network failure: ${error.message}`);
        netErr.code = 'NETWORK_FAILURE';
        netErr.diagnostics = diagnostics;
        throw netErr;
      }
    }
  }

  /**
   * Retrieve Financial Events for an Order (Finances API v0)
   * Strictly read-only operation to obtain refund events, shipment adjustments, and item adjustments.
   *
   * @param {string} orderId
   * @returns {Promise<Object|null>} FinancialEvents payload or null if not found/unauthorized
   */
  async getOrderFinancialEvents(orderId) {
    const cleanId = String(orderId).trim();
    const endpointPath = `/finances/v0/orders/${encodeURIComponent(cleanId)}/financialEvents`;

    try {
      const responseData = await this.executeRequest(endpointPath, {
        operation: 'getOrderFinancialEvents',
      });
      return responseData.FinancialEvents || responseData.payload?.FinancialEvents || responseData;
    } catch (error) {
      if (error.status === 404 || error.status === 400) {
        return null;
      }
      if (error.status === 403 || error.code === 'FORBIDDEN') {
        console.warn(`[Amazon SP-API Finances] Finance role not authorized or restricted for order ${orderId}:`, error.message);
        return null;
      }
      throw error;
    }
  }

  /**
   * Test connection state with cache-bypassing LWA verification:
   * 1. If Client ID/Secret missing: fails with MISSING_APP_CREDENTIALS
   * 2. If seller Refresh Token missing: reports clearly that Seller Central authorization is required
   * 3. If Refresh Token present: performs fresh LWA exchange (bypassing cache)
   */
  async testConnection() {
    if (!this.credentials.clientId || !this.credentials.clientSecret) {
      return {
        success: false,
        authenticated: false,
        message: 'Amazon SP-API LWA Client Identifier and Client Secret are not configured.',
        provider: 'AMAZON',
        code: 'MISSING_APP_CREDENTIALS',
      };
    }

    if (!this.credentials.refreshToken) {
      return {
        success: false,
        authenticated: false,
        message: 'Amazon SP-API Sandbox app credentials are configured, but a seller-authorized LWA Refresh Token is required. Please authorize the app in Seller Central to connect.',
        requiresSellerAuth: true,
        provider: 'AMAZON',
        region: this.region,
        endpoint: this.baseUrl,
      };
    }

    const auth = await handleAmazonAuth({
      ...this.credentials,
      bypassCache: true,
    });

    if (!auth.authenticated) {
      return {
        success: false,
        authenticated: false,
        message: auth.message,
        provider: 'AMAZON',
        code: auth.code,
      };
    }

    return {
      success: true,
      authenticated: true,
      message: `Amazon SP-API ${this.isSandbox ? 'Sandbox' : 'Production'} LWA authentication successful.`,
      provider: 'AMAZON',
      region: this.region,
      endpoint: this.baseUrl,
    };
  }

  /**
   * Return sanitized diagnostics from the most recent request
   */
  getLastRequestDiagnostics() {
    return (
      this.lastDiagnostics || {
        httpStatus: this.lastHttpStatus || null,
        endpoint: null,
        operation: null,
        durationMs: null,
        requestId: this.lastRequestId || null,
        rateLimit: this.lastRateLimit || null,
        retryAfter: this.lastRetryAfter || null,
        region: this.region,
        environment: this.isSandbox ? 'sandbox' : 'production',
        isSandbox: this.isSandbox,
        baseUrl: this.baseUrl,
        outcome: null,
      }
    );
  }
}
