import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { ProductIntelligenceResultSchema } from '../../services/aiMicroservice.schema.js';

export class VisionProvenanceError extends Error {
  constructor(message, code = 'PROVENANCE_ERROR', statusCode = 400) {
    super(message);
    this.name = 'VisionProvenanceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Maximum capacity for server-held bounded in-memory vision cache: 500 entries.
 */
export const MAX_STORE_ENTRIES = 500;

/**
 * Maximum individual serialized JSON payload size: 64 KB (65,536 bytes).
 * Standard ProductIntelligenceResult payloads range from 5 KB to 25 KB.
 * Rejects payloads larger than 64 KB to prevent memory exhaustion.
 */
export const MAX_INDIVIDUAL_PAYLOAD_BYTES = 64 * 1024;

/**
 * Maximum aggregate memory footprint for stored payloads: 5 MB (5,242,880 bytes).
 * Enforces a strict, deterministic upper ceiling on heap memory usage for this cache.
 */
export const MAX_AGGREGATE_STORE_BYTES = 5 * 1024 * 1024;

/**
 * Default TTL for vision provenance tokens and server-held cache entries: 30 minutes.
 */
export const DEFAULT_PROVENANCE_TTL_MS = 30 * 60 * 1000;

/**
 * In-memory server store for active vision results.
 * Maps resultId (UUIDv4) -> { resultId, sellerId, storeId, visionData, digest, byteSize, createdAt, expiresAt }
 */
const visionStore = new Map();

/**
 * Tracks aggregate byte size of all stored visionData entries in memory.
 */
let currentStoreBytes = 0;

/**
 * Deep clones an object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deterministically serialize any object with sorted keys
 * to ensure reproducible SHA-256 digest calculation.
 */
export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}';
}

/**
 * Computes SHA-256 cryptographic hex digest of vision result object.
 */
export function computeVisionDigest(visionData) {
  const canonical = canonicalStringify(visionData);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Cryptographically derives a dedicated 256-bit HMAC signing key
 * from config.jwt.accessSecret without reusing secrets or creating token confusion.
 */
export function getProvenanceSigningKey() {
  const rootSecret = config.jwt.accessSecret;
  if (!rootSecret) {
    throw new VisionProvenanceError(
      'Signing key derivation failed: JWT access secret is unconfigured.',
      'SIGNING_KEY_UNAVAILABLE',
      500
    );
  }
  return crypto
    .createHmac('sha256', rootSecret)
    .update('bhartiye-crafts:ai-vision-provenance:v1')
    .digest('hex');
}

/**
 * Evicts expired entries and enforces entry count & aggregate byte capacity via LRU.
 *
 * @param {number} incomingBytes - Byte size of the incoming payload to reserve space for
 */
function pruneStore(incomingBytes = 0) {
  const now = Date.now();

  // 1. Purge expired entries
  for (const [key, item] of visionStore.entries()) {
    if (now > item.expiresAt) {
      currentStoreBytes -= (item.byteSize || 0);
      visionStore.delete(key);
    }
  }

  // Ensure currentStoreBytes does not drop below 0 due to precision
  if (currentStoreBytes < 0) {
    currentStoreBytes = 0;
  }

  // 2. Enforce capacity limits: both entry count (MAX_STORE_ENTRIES) AND aggregate bytes (MAX_AGGREGATE_STORE_BYTES)
  while (
    visionStore.size >= MAX_STORE_ENTRIES ||
    (currentStoreBytes + incomingBytes > MAX_AGGREGATE_STORE_BYTES && visionStore.size > 0)
  ) {
    const oldestKey = visionStore.keys().next().value;
    if (oldestKey) {
      const oldestItem = visionStore.get(oldestKey);
      if (oldestItem) {
        currentStoreBytes -= (oldestItem.byteSize || 0);
      }
      visionStore.delete(oldestKey);
    } else {
      break;
    }
  }

  if (currentStoreBytes < 0) {
    currentStoreBytes = 0;
  }
}

/**
 * Stores validated vision data and issues a signed, tenant-bound provenance JWT.
 *
 * @param {object} params
 * @param {object} params.visionData - Validated ProductIntelligenceResult
 * @param {string} params.sellerId - Authenticated seller ID (from req.tenant.sellerId)
 * @param {string|null} [params.storeId] - Authenticated store ID (from req.tenant.storeId)
 * @param {number} [params.ttlMs=DEFAULT_PROVENANCE_TTL_MS] - Time to live in milliseconds
 * @returns {object} { visionToken, resultId, expiresAt }
 */
export function createVisionProvenanceToken({
  visionData,
  sellerId,
  storeId = null,
  ttlMs = DEFAULT_PROVENANCE_TTL_MS,
}) {
  if (!visionData) {
    throw new VisionProvenanceError('Cannot create provenance token: visionData is required.', 'MISSING_VISION_DATA', 400);
  }
  if (!sellerId) {
    throw new VisionProvenanceError('Cannot create provenance token: sellerId is required.', 'MISSING_SELLER_ID', 400);
  }

  const canonicalStr = canonicalStringify(visionData);
  const payloadBytes = Buffer.byteLength(canonicalStr, 'utf8');

  // Enforce individual payload size bound
  if (payloadBytes > MAX_INDIVIDUAL_PAYLOAD_BYTES) {
    throw new VisionProvenanceError(
      `Vision payload size (${payloadBytes} bytes) exceeds maximum individual limit of ${MAX_INDIVIDUAL_PAYLOAD_BYTES} bytes (64 KB).`,
      'OVERSIZED_VISION_RESULT',
      400
    );
  }

  // Prune expired entries and make space for incomingBytes
  pruneStore(payloadBytes);

  const resultId = crypto.randomUUID();
  const digest = crypto.createHash('sha256').update(canonicalStr).digest('hex');
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlMs;
  const normalizedStoreId = storeId ? String(storeId) : null;

  // Save to bounded server-held store
  visionStore.set(resultId, {
    resultId,
    sellerId: String(sellerId),
    storeId: normalizedStoreId,
    visionData: Object.freeze(deepClone(visionData)),
    digest,
    byteSize: payloadBytes,
    createdAt,
    expiresAt,
  });

  currentStoreBytes += payloadBytes;

  const payload = {
    sub: resultId,
    sellerId: String(sellerId),
    storeId: normalizedStoreId,
    digest,
    type: 'vision_provenance',
    jti: crypto.randomUUID(),
  };

  const signingKey = getProvenanceSigningKey();
  const expiresInSeconds = Math.max(1, Math.floor(ttlMs / 1000));

  const visionToken = jwt.sign(payload, signingKey, {
    expiresIn: expiresInSeconds,
    algorithm: 'HS256',
  });

  return {
    visionToken,
    resultId,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Verifies the vision provenance token, enforces tenant binding,
 * and resolves the trusted vision data from either server-held cache or verified client digest.
 *
 * @param {object} params
 * @param {string} params.visionToken - Signed JWT vision token
 * @param {string} params.sellerId - Authenticated seller ID (from req.tenant.sellerId)
 * @param {string|null} [params.storeId] - Authenticated store ID (from req.tenant.storeId)
 * @param {object} [params.clientVisionData] - Optional client-supplied vision data for digest verification
 * @returns {object} { resultId, visionData, sellerId, storeId }
 */
export function verifyAndResolveVisionProvenance({
  visionToken,
  sellerId,
  storeId = null,
  clientVisionData = null,
}) {
  if (!visionToken || typeof visionToken !== 'string') {
    throw new VisionProvenanceError(
      'Missing or invalid vision provenance token. A valid token is required.',
      'MISSING_VISION_TOKEN',
      400
    );
  }

  if (!sellerId) {
    throw new VisionProvenanceError(
      'Tenant identity unresolved. Authentication required.',
      'UNAUTHORIZED_TENANT',
      401
    );
  }

  const signingKey = getProvenanceSigningKey();
  let decoded;

  try {
    decoded = jwt.verify(visionToken, signingKey, {
      algorithms: ['HS256'],
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new VisionProvenanceError(
        'Vision token has expired. Please re-analyze the image.',
        'VISION_TOKEN_EXPIRED',
        401
      );
    }
    throw new VisionProvenanceError(
      'Invalid, tampered, or forged vision provenance token.',
      'INVALID_VISION_TOKEN',
      401
    );
  }

  // 1. Enforce Token Type
  if (!decoded || decoded.type !== 'vision_provenance') {
    throw new VisionProvenanceError(
      'Invalid token type. Vision provenance token expected.',
      'INVALID_TOKEN_TYPE',
      401
    );
  }

  // 2. Enforce Tenant (Seller) Binding
  const expectedSellerId = String(sellerId);
  if (decoded.sellerId !== expectedSellerId) {
    throw new VisionProvenanceError(
      'Access forbidden: vision token belongs to another seller.',
      'TENANT_MISMATCH',
      403
    );
  }

  // 3. Enforce Store Binding (if storeId is present on token or tenant)
  const expectedStoreId = storeId ? String(storeId) : null;
  if (decoded.storeId !== expectedStoreId) {
    throw new VisionProvenanceError(
      'Access forbidden: vision token belongs to another store.',
      'STORE_MISMATCH',
      403
    );
  }

  // 4. Resolve Vision Data: Check server-held store first
  const stored = visionStore.get(decoded.sub);

  if (stored) {
    if (Date.now() > stored.expiresAt) {
      currentStoreBytes -= (stored.byteSize || 0);
      visionStore.delete(decoded.sub);
      if (currentStoreBytes < 0) currentStoreBytes = 0;
      throw new VisionProvenanceError(
        'Vision result has expired in server cache. Please re-analyze the image.',
        'VISION_RESULT_EXPIRED',
        410
      );
    }

    if (stored.sellerId !== expectedSellerId || stored.storeId !== expectedStoreId) {
      throw new VisionProvenanceError(
        'Access forbidden: cached vision record tenant mismatch.',
        'TENANT_MISMATCH',
        403
      );
    }

    // Verify digest integrity of stored copy
    const storedDigest = computeVisionDigest(stored.visionData);
    if (storedDigest !== decoded.digest) {
      throw new VisionProvenanceError(
        'Cryptographic integrity violation in cached vision data.',
        'TAMPERED_VISION_DATA',
        403
      );
    }

    // Refresh recency for genuine LRU: reinsert at end of Map without mutating payload, expiry, or byte accounting
    visionStore.delete(decoded.sub);
    visionStore.set(decoded.sub, stored);

    return {
      resultId: decoded.sub,
      visionData: stored.visionData,
      sellerId: decoded.sellerId,
      storeId: decoded.storeId,
    };
  }

  // 5. Fallback: If not in memory store (e.g. server restart), verify client-supplied data against signed digest
  if (clientVisionData) {
    const clientDigest = computeVisionDigest(clientVisionData);
    if (clientDigest !== decoded.digest) {
      throw new VisionProvenanceError(
        'Tampered vision data: payload does not match the signed cryptographic digest.',
        'TAMPERED_VISION_DATA',
        403
      );
    }

    // Strictly validate structure against schema
    let validatedData;
    try {
      validatedData = ProductIntelligenceResultSchema.parse(clientVisionData);
    } catch (zodErr) {
      throw new VisionProvenanceError(
        `Malformed vision data structure: ${zodErr.message}`,
        'MALFORMED_VISION_DATA',
        400
      );
    }

    return {
      resultId: decoded.sub,
      visionData: Object.freeze(deepClone(validatedData)),
      sellerId: decoded.sellerId,
      storeId: decoded.storeId,
    };
  }

  throw new VisionProvenanceError(
    'Vision result expired or not found. Please re-analyze the image.',
    'VISION_RESULT_NOT_FOUND',
    404
  );
}

/**
 * Resets the in-memory vision store (strictly for testing).
 */
export function clearVisionStore() {
  visionStore.clear();
  currentStoreBytes = 0;
}

/**
 * Returns current count of stored items (strictly for testing).
 */
export function getVisionStoreSize() {
  return visionStore.size;
}

/**
 * Returns current aggregate memory footprint of stored items in bytes (strictly for testing).
 */
export function getCurrentStoreBytes() {
  return currentStoreBytes;
}
