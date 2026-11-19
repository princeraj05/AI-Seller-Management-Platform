import { config, resolveSpApiEndpoint } from '../../../config/env.js';
import { handleAmazonAuth, clearLwaTokenCache } from './amazon.auth.js';
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  calculateBackoffDelay,
  parseRateLimitHeaders,
  sleep,
} from './amazon.rateLimiter.js';

export class AmazonSpApiClient {
  /**
   * @param {Object} credentials
   * @param {string} [credentials.clientId]
   * @param {string} [credentials.clientSecret]
   * @param {string} [credentials.refreshToken]
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

    this.credentials = {
      clientId: credentials.clientId || config.amazon?.clientId || process.env.AMAZON_SP_API_CLIENT_ID,
      clientSecret: credentials.clientSecret || config.amazon?.clientSecret || process.env.AMAZON_SP_API_CLIENT_SECRET,
      appId: credentials.appId || config.amazon?.appId || process.env.AMAZON_SP_API_APP_ID,
      refreshToken: credentials.refreshToken || config.amazon?.refreshToken || process.env.AMAZON_SP_API_REFRESH_TOKEN,
      region: this.region,
      sandbox: this.isSandbox,
      ...credentials,
    };

    // Region-aware endpoint (EU for India-first: sandbox.sellingpartnerapi-eu.amazon.com)
    this.baseUrl = resolveSpApiEndpoint(this.region, this.isSandbox ? 'sandbox' : 'production');

    // Amazon-specific rate limit and retry configuration
    this.rateLimitConfig = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ...(credentials.rateLimitConfig || {}),
    };

    // Telemetry tracking for rate limit headers
    this.lastRateLimit = null;
    this.lastRetryAfter = null;
  }

  /**
   * Obtain a valid LWA access token before issuing API requests
   */
  async getAccessToken() {
    const auth = await handleAmazonAuth(this.credentials);
    if (!auth.authenticated) {
      const err = new Error(auth.message || 'LWA authentication failed');
      err.code = auth.code;
      err.requiresSellerAuth = auth.requiresSellerAuth;
      throw err;
    }
    return auth.accessToken;
  }

  /**
   * Execute an authenticated SP-API request with rate limit handling, header parsing, and exponential backoff
   *
   * @param {string} endpointPath e.g. '/orders/2026-01-01/orders'
   * @param {Object} options fetch options
   */
  async executeRequest(endpointPath, options = {}) {
    const url = `${this.baseUrl}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;
    const maxRetries = options.maxRetries ?? this.rateLimitConfig.maxRetries;

    let attempt = 0;

    while (true) {
      const accessToken = await this.getAccessToken();

      const headers = {
        'x-amz-access-token': accessToken,
        'User-Agent': 'AISellerManagementPlatform/1.0 (Language=Node.js)',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {}),
      };

      try {
        const response = await fetch(url, {
          ...options,
          headers,
        });

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

        // Sanitized diagnostic logging (Never logs tokens, secrets, or keys)
        console.log(
          `[Amazon SP-API Diagnostics] HTTP ${response.status} | RequestId: ${requestId || 'N/A'} | Path: ${endpointPath.split('?')[0]}`
        );

        // 2. Handle 401 Unauthorized: Invalidate cached token and retry once if fresh
        if (response.status === 401) {
          clearLwaTokenCache();
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

          const rateErr = new Error(`Amazon SP-API rate limit exceeded for ${endpointPath} (HTTP 429) after ${attempt} retries`);
          rateErr.status = 429;
          rateErr.code = 'RATE_LIMITED';
          rateErr.retryAfter = retryAfter;
          rateErr.requestId = requestId;
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
          err.code = response.status === 403 ? 'FORBIDDEN' : 'API_ERROR';
          err.requestId = requestId;
          err.sanitizedData = data;
          throw err;
        }

        // Attach sanitized request metadata to response object
        if (data && typeof data === 'object') {
          data._metadata = {
            status: response.status,
            requestId,
            rateLimit: limit,
          };
        }

        return data;
      } catch (error) {
        if (error.code) throw error;
        const netErr = new Error(`Amazon SP-API network failure: ${error.message}`);
        netErr.code = 'NETWORK_FAILURE';
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
      const responseData = await this.executeRequest(endpointPath);
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
   * Test connection state:
   * 1. If Client ID/Secret missing: fails with MISSING_APP_CREDENTIALS
   * 2. If seller Refresh Token missing: reports clearly that Seller Central authorization is required
   * 3. If Refresh Token present: performs actual LWA exchange
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

    const auth = await handleAmazonAuth(this.credentials);

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
      message: 'Amazon SP-API Sandbox LWA authentication successful.',
      provider: 'AMAZON',
      region: this.region,
      endpoint: this.baseUrl,
    };
  }

  /**
   * Return sanitized diagnostics from the most recent request
   */
  getLastRequestDiagnostics() {
    return {
      httpStatus: this.lastHttpStatus || null,
      requestId: this.lastRequestId || null,
      rateLimit: this.lastRateLimit || null,
      retryAfter: this.lastRetryAfter || null,
      region: this.region,
      isSandbox: this.isSandbox,
      baseUrl: this.baseUrl,
    };
  }
}
