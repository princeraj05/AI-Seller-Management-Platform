/**
 * Amazon SP-API Rate Limiter & Retry Utility
 *
 * Official Orders API v2026-01-01 Usage Plan Limits:
 * - searchOrders: Rate: 0.0056 requests/sec, Burst: 20
 * - getOrder: Rate: 0.5 requests/sec, Burst: 30
 *
 * Implements:
 * - Parsing of x-amzn-RateLimit-Limit response headers
 * - Respect for HTTP 429 and Retry-After response headers
 * - Exponential backoff with random jitter (prevents thundering herd)
 * - Strict maximum retry cap (prevents indefinite retry loops)
 * - Isolated configuration specific to Amazon SP-API
 */

export const DEFAULT_RATE_LIMIT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterRatio: 0.25,
  minRequestIntervalMs: 200, // Conservative inter-request spacing
};

/**
 * Calculate delay in milliseconds using exponential backoff with jitter
 *
 * @param {number} attempt Zero-based retry attempt
 * @param {number|null} [retryAfterSeconds=null] From Retry-After response header
 * @param {Object} [config] Custom rate limit config
 * @returns {number} Milliseconds to wait
 */
export const calculateBackoffDelay = (attempt, retryAfterSeconds = null, config = {}) => {
  const baseDelayMs = config.baseDelayMs || DEFAULT_RATE_LIMIT_CONFIG.baseDelayMs;
  const maxDelayMs = config.maxDelayMs || DEFAULT_RATE_LIMIT_CONFIG.maxDelayMs;
  const jitterRatio = config.jitterRatio !== undefined ? config.jitterRatio : DEFAULT_RATE_LIMIT_CONFIG.jitterRatio;

  let delayMs = retryAfterSeconds && retryAfterSeconds > 0
    ? retryAfterSeconds * 1000
    : baseDelayMs * Math.pow(2, attempt);

  // Add jitter: +/- jitterRatio
  const jitter = delayMs * jitterRatio * (Math.random() * 2 - 1);
  const totalDelay = Math.min(Math.max(delayMs + jitter, 100), maxDelayMs);

  return Math.round(totalDelay);
};

/**
 * Parse standard Amazon rate limit headers from a Fetch response
 *
 * @param {Response|Object} response
 * @returns {{ limit: number|null, retryAfter: number|null }}
 */
export const parseRateLimitHeaders = (response) => {
  if (!response || !response.headers) {
    return { limit: null, retryAfter: null };
  }

  let limit = null;
  let retryAfter = null;

  try {
    const getHeader = typeof response.headers.get === 'function'
      ? (name) => response.headers.get(name)
      : (name) => response.headers[name.toLowerCase()] || response.headers[name];

    const rawLimit = getHeader('x-amzn-ratelimit-limit') || getHeader('x-amzn-RateLimit-Limit');
    if (rawLimit) {
      const parsed = parseFloat(rawLimit);
      if (!isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
    }

    const rawRetryAfter = getHeader('retry-after') || getHeader('Retry-After');
    if (rawRetryAfter) {
      const parsed = parseInt(rawRetryAfter, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfter = parsed;
      }
    }
  } catch (err) {
    // Ignore header extraction failure
  }

  return { limit, retryAfter };
};

/**
 * Asynchronous sleep helper
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
