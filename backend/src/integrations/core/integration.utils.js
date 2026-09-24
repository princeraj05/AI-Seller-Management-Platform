import { SSRFValidationError, RateLimitError } from './integration.errors.js';

/**
 * Validates a URL to prevent SSRF vulnerabilities.
 * Blocks localhost, private IP ranges, loopbacks, and cloud metadata IPs.
 */
export const validateExternalUrl = (urlString) => {
  if (!urlString || typeof urlString !== 'string') {
    throw new SSRFValidationError('Invalid or empty URL');
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    throw new SSRFValidationError(`Malformed URL: ${urlString}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SSRFValidationError(`Only HTTP and HTTPS protocols are allowed: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block loopback & localhost strings
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new SSRFValidationError(hostname);
  }

  // Block cloud metadata & API IP addresses (e.g. AWS 169.254.169.254)
  if (hostname.startsWith('169.254.') || hostname.startsWith('100.64.')) {
    throw new SSRFValidationError(hostname);
  }

  // Regex checks for IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);

  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);

    if (
      p1 === 127 || // 127.0.0.0/8
      p1 === 10 || // 10.0.0.0/8
      p1 === 0 || // 0.0.0.0/8
      (p1 === 172 && p2 >= 16 && p2 <= 31) || // 172.16.0.0/12
      (p1 === 192 && p2 === 168) || // 192.168.0.0/16
      (p1 === 169 && p2 === 254) // 169.254.0.0/16
    ) {
      throw new SSRFValidationError(hostname);
    }
  }

  return true;
};

/**
 * Executes an async operation with exponential backoff retry logic.
 */
export const executeWithRetry = async (fn, options = {}) => {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 500;

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;

      // Do NOT retry authentication (401/403) or SSRF (400) errors
      if (err.statusCode === 401 || err.statusCode === 403 || err.code === 'SSRF_BLOCKED' || err.statusCode === 400) {
        throw err;
      }

      if (attempt >= maxRetries) {
        throw err;
      }

      const retryAfterSec = err instanceof RateLimitError ? err.retryAfter : null;
      const delayMs = retryAfterSec ? retryAfterSec * 1000 : initialDelay * Math.pow(2, attempt - 1);
      
      console.warn(`Integration API attempt ${attempt} failed. Retrying in ${delayMs}ms:`, err.message);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
};
