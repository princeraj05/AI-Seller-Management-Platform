import crypto from 'crypto';
import { config } from '../config/env.js';
import {
  validateProductIntelligenceResponse,
  validateVisionStatusResponse,
} from './aiMicroservice.schema.js';

/**
 * Custom Error for AI Microservice communication failures.
 * Never leaks internal secrets or sensitive headers.
 */
/**
 * Custom Error for AI Microservice communication failures.
 * Never leaks internal secrets or sensitive headers.
 */
export class AiMicroserviceError extends Error {
  constructor(message, code = 'AI_SERVICE_ERROR', statusCode = 500, details = null, secretToRedact = null) {
    // Sanitize any accidental secret leakage from error message
    const sanitizedMessage = AiMicroserviceError.sanitize(message, secretToRedact);
    super(sanitizedMessage);
    this.name = 'AiMicroserviceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details ? AiMicroserviceError.sanitizeDetails(details, secretToRedact) : null;
  }

  static sanitize(text, customSecret = null) {
    if (!text || typeof text !== 'string') return text;
    let result = text;
    // Redact instance-specific custom secret if provided
    if (customSecret && typeof customSecret === 'string' && customSecret.length >= 8 && result.includes(customSecret)) {
      result = result.replaceAll(customSecret, '[REDACTED_SECRET]');
    }
    // Also redact global configured secret
    const globalSecret = config.aiService?.secret;
    if (globalSecret && typeof globalSecret === 'string' && globalSecret.length >= 8 && result.includes(globalSecret)) {
      result = result.replaceAll(globalSecret, '[REDACTED_SECRET]');
    }
    return result;
  }

  static sanitizeDetails(details, customSecret = null) {
    try {
      const serialized = JSON.stringify(details);
      const sanitized = AiMicroserviceError.sanitize(serialized, customSecret);
      return JSON.parse(sanitized);
    } catch {
      return { note: 'Sanitized error details' };
    }
  }
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB limit consistent with Python service
const MAX_USER_HINT_LENGTH = 500;

/**
 * Dedicated Authenticated HTTP Client for Python FastAPI AI Microservice.
 * Handles mutual service-key authentication, tenant context injection,
 * pre-flight validation, and typed response validation.
 */
export class AiMicroserviceClient {
  constructor(options = {}) {
    const rawUrl = options.url !== undefined ? options.url : (config.aiService?.url || 'http://127.0.0.1:8000');
    this.url = String(rawUrl).replace(/\/+$/, '');

    const rawSecret = options.secret !== undefined ? options.secret : config.aiService?.secret;
    const secretCandidate = (rawSecret && typeof rawSecret === 'string') ? rawSecret.trim() : '';
    if (!secretCandidate) {
      throw new AiMicroserviceError(
        'AI microservice secret is missing or not configured.',
        'AI_SERVICE_CONFIG_ERROR',
        500,
        null,
        secretCandidate
      );
    }
    this.secret = secretCandidate;
    
    const rawTimeout = options.timeout !== undefined ? options.timeout : config.aiService?.timeout;
    const parsedTimeout = Number(rawTimeout);
    if (!Number.isSafeInteger(parsedTimeout) || parsedTimeout <= 0) {
      throw this._createError(
        'Invalid AI microservice timeout: must be a positive safe integer representing milliseconds.',
        'AI_SERVICE_CONFIG_ERROR',
        500
      );
    }
    this.timeout = parsedTimeout;

    if (!this.url.startsWith('http://') && !this.url.startsWith('https://')) {
      throw this._createError(
        `Invalid AI microservice URL protocol: must start with http:// or https://, got '${this.url}'`,
        'AI_SERVICE_CONFIG_ERROR',
        500
      );
    }
  }

  /**
   * Helper to construct an AiMicroserviceError bound to this client instance's secret.
   * @private
   */
  _createError(message, code = 'AI_SERVICE_ERROR', statusCode = 500, details = null) {
    return new AiMicroserviceError(message, code, statusCode, details, this.secret);
  }

  /**
   * Health and readiness probe against Python vision status endpoint.
   * Authenticates using the internal service secret.
   *
   * @param {Object} [options]
   * @param {string} [options.requestId]
   * @returns {Promise<{available: boolean, status: object, raw: object}>}
   */
  async checkHealth(options = {}) {
    const reqId = options.requestId || `req-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const endpoint = `${this.url}/api/v1/vision/status`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Internal-Service-Key': this.secret,
          'X-Request-ID': reqId,
        },
        signal: AbortSignal.timeout(Math.min(this.timeout, 10000)), // Bounded probe timeout
      });

      if (!response.ok) {
        let errDetails = null;
        try {
          errDetails = await response.json();
        } catch {
          errDetails = { statusText: response.statusText };
        }

        if (response.status === 401) {
          throw this._createError(
            'Internal authentication failed querying AI service status (invalid X-Internal-Service-Key).',
            'AI_SERVICE_AUTH_ERROR',
            401,
            errDetails
          );
        }

        throw this._createError(
          `AI service status check failed with HTTP ${response.status}.`,
          'AI_SERVICE_HTTP_ERROR',
          response.status,
          errDetails
        );
      }

      const json = await response.json();
      const validated = validateVisionStatusResponse(json);

      return {
        available: Boolean(validated.data?.ready ?? validated.success),
        status: validated.data,
        raw: validated,
      };
    } catch (err) {
      if (err instanceof AiMicroserviceError) {
        err.message = AiMicroserviceError.sanitize(err.message, this.secret);
        if (err.details) {
          err.details = AiMicroserviceError.sanitizeDetails(err.details, this.secret);
        }
        throw err;
      }
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw this._createError(
          'AI microservice health check timed out.',
          'AI_SERVICE_TIMEOUT',
          504
        );
      }
      if (err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED') {
        throw this._createError(
          `Unable to connect to AI microservice at ${this.url}. Service may be offline.`,
          'AI_SERVICE_UNAVAILABLE',
          503
        );
      }
      throw this._createError(
        `AI microservice status probe failed: ${err.message}`,
        'AI_SERVICE_UNAVAILABLE',
        503
      );
    }
  }

  /**
   * Primary Product Intelligence extraction method.
   * Sends image bytes to Python FastAPI service via multipart/form-data.
   *
   * @param {Object} params
   * @param {Buffer|Uint8Array} params.imageBuffer - Raw image binary buffer
   * @param {string} [params.filename='upload.jpg'] - Image filename
   * @param {string} [params.mimeType='image/jpeg'] - Image MIME type (JPEG, PNG, WEBP)
   * @param {string} params.sellerId - Mandatory seller identifier for tenant context
   * @param {string} [params.storeId] - Optional store identifier
   * @param {string} [params.requestId] - Optional request correlation ID
   * @param {boolean} [params.enableOcr=true] - Whether to execute OCR text extraction
   * @param {string} [params.userHint] - Optional seller description or hint for context
   * @returns {Promise<import('./aiMicroservice.schema.js').BaseVisionResponseSchema>}
   */
  async extractProductAttributes({
    imageBuffer,
    filename = 'upload.jpg',
    mimeType = 'image/jpeg',
    sellerId,
    storeId,
    requestId,
    enableOcr = true,
    userHint,
  }) {
    // 1. Pre-flight input validation
    if (!imageBuffer || !(imageBuffer instanceof Buffer || imageBuffer instanceof Uint8Array)) {
      throw this._createError(
        'Uploaded image buffer is missing or invalid.',
        'AI_SERVICE_INPUT_ERROR',
        400
      );
    }

    if (imageBuffer.length === 0) {
      throw this._createError(
        'Uploaded image buffer is empty (0 bytes).',
        'AI_SERVICE_INPUT_ERROR',
        400
      );
    }

    if (imageBuffer.length > MAX_IMAGE_BYTES) {
      throw this._createError(
        `Image size (${(imageBuffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed limit of 10MB.`,
        'AI_SERVICE_INPUT_ERROR',
        400,
        { sizeBytes: imageBuffer.length, maxBytes: MAX_IMAGE_BYTES }
      );
    }

    const normMime = String(mimeType).toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normMime)) {
      throw this._createError(
        `Unsupported image format '${mimeType}'. Allowed formats: image/jpeg, image/png, image/webp.`,
        'AI_SERVICE_INPUT_ERROR',
        400,
        { mimeType, allowed: Array.from(ALLOWED_MIME_TYPES) }
      );
    }

    if (!sellerId || typeof sellerId !== 'string' || !sellerId.trim()) {
      throw this._createError(
        'Seller context required. Non-empty sellerId must be provided by authenticated tenant context.',
        'AI_SERVICE_INPUT_ERROR',
        400
      );
    }

    if (userHint !== undefined && userHint !== null) {
      if (typeof userHint !== 'string') {
        throw this._createError(
          'User hint must be a string if provided.',
          'AI_SERVICE_INPUT_ERROR',
          400
        );
      }
      if (userHint.length > MAX_USER_HINT_LENGTH) {
        throw this._createError(
          `User hint exceeds maximum allowed length of ${MAX_USER_HINT_LENGTH} characters.`,
          'AI_SERVICE_INPUT_ERROR',
          400,
          { length: userHint.length, maxLength: MAX_USER_HINT_LENGTH }
        );
      }
    }

    // 2. Request correlation ID
    const reqId = requestId || `req-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    // 3. Assemble multipart/form-data payload
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: normMime });
    formData.append('file', blob, filename || 'upload.jpg');
    formData.append('enable_ocr', String(Boolean(enableOcr)));
    if (userHint && userHint.trim()) {
      formData.append('user_hint', userHint.trim());
    }

    // 4. Construct request headers
    const headers = {
      'Accept': 'application/json',
      'X-Internal-Service-Key': this.secret,
      'X-Seller-ID': String(sellerId).trim(),
      'X-Request-ID': reqId,
      'X-User-Role': 'seller',
    };
    if (storeId && typeof storeId === 'string' && storeId.trim()) {
      headers['X-Store-ID'] = storeId.trim();
    }

    const targetUrl = `${this.url}/api/v1/vision/extract-attributes`;

    // 5. Execute HTTP POST request with bounded timeout
    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (networkErr) {
      if (networkErr.name === 'TimeoutError' || networkErr.name === 'AbortError') {
        throw this._createError(
          `AI microservice vision inference timed out after ${this.timeout}ms.`,
          'AI_SERVICE_TIMEOUT',
          504,
          { timeoutMs: this.timeout }
        );
      }
      if (networkErr.code === 'ECONNREFUSED' || networkErr.cause?.code === 'ECONNREFUSED') {
        throw this._createError(
          `Unable to connect to AI microservice at ${this.url}. Service may be offline.`,
          'AI_SERVICE_UNAVAILABLE',
          503,
          { url: this.url }
        );
      }
      throw this._createError(
        `Network error communicating with AI microservice: ${networkErr.message}`,
        'AI_SERVICE_UNAVAILABLE',
        503,
        { error: networkErr.message }
      );
    }

    // 6. Handle HTTP error status codes
    if (!response.ok) {
      let errorJson = null;
      let rawText = '';
      try {
        errorJson = await response.json();
      } catch {
        try {
          rawText = await response.text();
        } catch {
          rawText = response.statusText;
        }
      }

      const errorMessage = errorJson?.message || rawText || `HTTP ${response.status}`;
      const errorDetails = errorJson?.details || errorJson || { rawText: rawText.slice(0, 300) };

      if (response.status === 401) {
        throw this._createError(
          `AI microservice authentication failed: ${errorMessage}`,
          'AI_SERVICE_AUTH_ERROR',
          401,
          errorDetails
        );
      }

      if (response.status === 403) {
        throw this._createError(
          `AI microservice rejected tenant context: ${errorMessage}`,
          'AI_SERVICE_FORBIDDEN',
          403,
          errorDetails
        );
      }

      if (response.status === 422) {
        throw this._createError(
          `AI microservice image validation failed: ${errorMessage}`,
          'AI_SERVICE_VALIDATION_ERROR',
          422,
          errorDetails
        );
      }

      if (response.status === 502 || response.status === 503) {
        throw this._createError(
          `AI microservice upstream model failure: ${errorMessage}`,
          'AI_SERVICE_UPSTREAM_ERROR',
          response.status,
          errorDetails
        );
      }

      throw this._createError(
        `AI microservice returned HTTP ${response.status}: ${errorMessage}`,
        'AI_SERVICE_HTTP_ERROR',
        response.status,
        errorDetails
      );
    }

    // 7. Parse and structurally validate response JSON
    let parsedJson;
    try {
      parsedJson = await response.json();
    } catch (parseErr) {
      throw this._createError(
        'AI microservice returned malformed, non-JSON response.',
        'AI_SERVICE_SCHEMA_ERROR',
        502,
        { parseError: parseErr.message }
      );
    }

    try {
      return validateProductIntelligenceResponse(parsedJson);
    } catch (zodErr) {
      throw this._createError(
        `AI microservice response failed structural validation: ${zodErr.message}`,
        'AI_SERVICE_SCHEMA_ERROR',
        502,
        { issues: zodErr.issues }
      );
    }
  }
}

// Singleton client instance
let _clientInstance = null;

/**
 * Return singleton AiMicroserviceClient instance.
 * @returns {AiMicroserviceClient}
 */
export function getAiMicroserviceClient() {
  if (!_clientInstance) {
    _clientInstance = new AiMicroserviceClient();
  }
  return _clientInstance;
}
