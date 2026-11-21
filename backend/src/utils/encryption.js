import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const STANDARD_GCM_IV_BYTES = 12; // NIST SP 800-38D recommended 96-bit IV for new encryptions
const LEGACY_GCM_IV_BYTES = 16;   // Supported for backward-compatible decryption of existing credentials
const GCM_AUTH_TAG_BYTES = 16;
const DEFAULT_DEV_SECRET = 'antigravity_default_secret_key_32bytes_len!!';

const INSECURE_ENCRYPTION_PLACEHOLDERS = new Set([
  DEFAULT_DEV_SECRET,
  'your_32_byte_secret_key_here',
  'your_super_secret_jwt_access_key_min_32_chars_long',
  'your_super_secret_jwt_refresh_key_min_32_chars_long',
  'dev_internal_ai_service_secret_key_change_in_production_32b',
  'your_32_character_internal_service_secret_here',
]);

const OAUTH_HKDF_SALT = Buffer.from('ai-seller-platform-oauth-state-salt-v1', 'utf8');
const OAUTH_HKDF_INFO = Buffer.from('oauth-state-hmac-sha256-v1', 'utf8');

/**
 * Validate encryption key configuration. Safe to invoke at startup.
 * Enforces strict secret requirements in production and key separation from JWT secrets.
 */
export const validateEncryptionConfig = (env = process.env) => {
  const isProd = (env.NODE_ENV || 'development') === 'production';
  const rawKey = typeof env.INTEGRATION_ENCRYPTION_KEY === 'string'
    ? env.INTEGRATION_ENCRYPTION_KEY.trim()
    : '';

  if (isProd) {
    if (!rawKey || rawKey.length < 32) {
      throw new Error(
        'CRITICAL SECURITY ERROR: INTEGRATION_ENCRYPTION_KEY must be set and at least 32 characters in production.'
      );
    }
    if (INSECURE_ENCRYPTION_PLACEHOLDERS.has(rawKey)) {
      throw new Error(
        'CRITICAL SECURITY ERROR: INTEGRATION_ENCRYPTION_KEY cannot use a documented placeholder or default dev secret in production.'
      );
    }
  }

  // Enforce separation of duties: Encryption key cannot be identical to JWT secrets
  if (
    rawKey &&
    (rawKey === env.JWT_ACCESS_SECRET || rawKey === env.JWT_REFRESH_SECRET)
  ) {
    throw new Error('CRITICAL SECURITY ERROR: INTEGRATION_ENCRYPTION_KEY must not reuse JWT secrets.');
  }

  return true;
};

/**
 * Validates and retrieves the 256-bit AES-GCM credential encryption key
 */
export const getEncryptionKey = () => {
  validateEncryptionConfig(process.env);
  const secret = (process.env.INTEGRATION_ENCRYPTION_KEY || DEFAULT_DEV_SECRET).trim();
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Derive an independent 256-bit HMAC key for OAuth state signing via HKDF-SHA256
 * (cryptographic domain separation from the AES-256-GCM credential encryption key).
 */
export const getOAuthHmacKey = () => {
  const masterKey = getEncryptionKey();
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, OAUTH_HKDF_SALT, OAUTH_HKDF_INFO, 32));
};

/**
 * Encrypt sensitive credentials string/object using AES-256-GCM with standard 12-byte (96-bit) IV
 *
 * @param {string|Object} data
 * @returns {{ iv: string, content: string, tag: string }|null}
 */
export const encryptCredentials = (data) => {
  if (!data) return null;
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(STANDARD_GCM_IV_BYTES);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    content: encrypted,
    tag: tag.toString('hex'),
  };
};

/**
 * Decrypt encrypted credentials back to string or parsed object using AES-256-GCM.
 * Supports both new 12-byte IVs and legacy 16-byte IVs for seamless backward compatibility.
 *
 * @param {{ iv: string, content: string, tag: string }} encryptedData
 * @returns {Object|string|null}
 */
export const decryptCredentials = (encryptedData) => {
  if (!encryptedData || !encryptedData.iv || !encryptedData.content || !encryptedData.tag) {
    return null;
  }

  try {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    if ((iv.length !== STANDARD_GCM_IV_BYTES && iv.length !== LEGACY_GCM_IV_BYTES) || tag.length !== GCM_AUTH_TAG_BYTES) {
      throw new Error('Invalid IV or authentication tag length');
    }

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    // Sanitized error - never leak sensitive details in logs or responses
    throw new Error('Failed to decrypt channel credentials: authenticity check failed or invalid key.');
  }
};

/**
 * Generate a cryptographically signed, expiring state token for OAuth flows (CSRF & Replay Protection)
 *
 * @param {string} tenantId
 * @param {string} [provider='AMAZON']
 * @param {number} [expiresInMs=900000] 15 minutes default
 * @returns {string} base64url encoded state string
 */
export const generateOAuthState = (tenantId, provider = 'AMAZON', expiresInMs = 15 * 60 * 1000, extra = {}) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required to generate OAuth state.');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + expiresInMs;
  const payload = {
    tenantId: tenantId.toString(),
    provider: String(provider || 'AMAZON').toUpperCase().trim(),
    nonce,
    exp,
  };

  if (extra && typeof extra === 'object') {
    if (extra.storeId !== undefined && extra.storeId !== null && String(extra.storeId).trim() !== '') {
      payload.storeId = String(extra.storeId).trim();
    }
    if (extra.region && typeof extra.region === 'string') {
      payload.region = extra.region.toLowerCase().trim();
    }
  }

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const hmacKey = getOAuthHmacKey();
  const signature = crypto.createHmac('sha256', hmacKey).update(payloadB64).digest('base64url');

  return `${payloadB64}.${signature}`;
};

// Process-local consumed nonces (used as a fast secondary cache and for sync unit tests)
const consumedStateNonces = new Map();

const cleanupExpiredNonces = () => {
  const now = Date.now();
  for (const [nonce, exp] of consumedStateNonces.entries()) {
    if (now > exp) {
      consumedStateNonces.delete(nonce);
    }
  }
};

/**
 * Reset consumed nonces in local memory (useful for testing)
 */
export const clearConsumedOAuthStates = () => {
  consumedStateNonces.clear();
};

/**
 * Pure cryptographic and structural validation of an OAuth state token (no side effects).
 */
const validateOAuthStateSignatureAndPayload = (stateString, expectedTenantId = null, expectedProvider = null) => {
  if (!stateString || typeof stateString !== 'string') {
    return { valid: false, error: 'Invalid OAuth state format.' };
  }

  const parts = stateString.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed OAuth state token structure.' };
  }

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) {
    return { valid: false, error: 'Malformed OAuth state token.' };
  }

  const hmacKey = getOAuthHmacKey();
  const expectedSig = crypto.createHmac('sha256', hmacKey).update(payloadB64).digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'OAuth state token signature verification failed (CSRF / tampering detected).' };
  }

  let payload;
  try {
    const jsonStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: 'Failed to parse OAuth state payload.' };
  }

  if (!payload || typeof payload !== 'object' || !payload.tenantId || !payload.nonce || typeof payload.nonce !== 'string') {
    return { valid: false, error: 'OAuth state payload is missing required fields.' };
  }

  if (!payload.provider || typeof payload.provider !== 'string') {
    return { valid: false, error: 'OAuth state payload is missing provider.' };
  }

  if (expectedProvider && payload.provider.toUpperCase() !== String(expectedProvider).toUpperCase()) {
    return { valid: false, error: 'OAuth state provider mismatch.' };
  }

  if (!payload.exp || typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    return { valid: false, error: 'OAuth state token has expired. Please initiate authorization again.' };
  }

  if (expectedTenantId && payload.tenantId !== expectedTenantId.toString()) {
    return { valid: false, error: 'Cross-tenant OAuth authorization mismatch.' };
  }

  return { valid: true, ...payload };
};

/**
 * Synchronous OAuth state verification with local single-use replay prevention.
 * For production/callback flows, use verifyOAuthStateDurable() which enforces atomic MongoDB consumption.
 *
 * @param {string} stateString
 * @param {string|null} [expectedTenantId=null]
 * @param {string|null} [expectedProvider=null]
 * @returns {{ valid: boolean, tenantId?: string, provider?: string, nonce?: string, exp?: number, error?: string }}
 */
export const verifyOAuthState = (stateString, expectedTenantId = null, expectedProvider = null) => {
  const checked = validateOAuthStateSignatureAndPayload(stateString, expectedTenantId, expectedProvider);
  if (!checked.valid) return checked;

  cleanupExpiredNonces();
  if (consumedStateNonces.has(checked.nonce)) {
    return { valid: false, error: 'OAuth state token has already been consumed (replay attack detected).' };
  }

  consumedStateNonces.set(checked.nonce, checked.exp);
  return checked;
};

/**
 * Durable asynchronous OAuth state verification backed by MongoDB's unique TTL ConsumedOAuthNonce collection.
 * - Atomic single-use nonce consumption (no self-race).
 * - Fail-closed on database unavailability or unexpected errors.
 * - Never logs raw OAuth nonces or tokens.
 *
 * @param {string} stateString
 * @param {string|null} [expectedTenantId=null]
 * @param {Object|string|null} [optionsOrProvider=null] Either expectedProvider string or { expectedProvider, nonceModel }
 * @returns {Promise<{ valid: boolean, tenantId?: string, provider?: string, nonce?: string, exp?: number, code?: string, error?: string }>}
 */
export const verifyOAuthStateDurable = async (stateString, expectedTenantId = null, optionsOrProvider = null) => {
  const expectedProvider =
    typeof optionsOrProvider === 'string'
      ? optionsOrProvider
      : optionsOrProvider?.expectedProvider || 'AMAZON';
  const injectedNonceModel =
    typeof optionsOrProvider === 'object' && optionsOrProvider !== null
      ? optionsOrProvider.nonceModel || null
      : null;

  const checked = validateOAuthStateSignatureAndPayload(stateString, expectedTenantId, expectedProvider);
  if (!checked.valid) return checked;

  cleanupExpiredNonces();
  if (consumedStateNonces.has(checked.nonce)) {
    return {
      valid: false,
      code: 'OAUTH_STATE_REPLAY',
      error: 'OAuth state token has already been consumed (replay attack detected).',
    };
  }

  try {
    const NonceModel =
      injectedNonceModel || (await import('../modules/channels/consumedOAuthNonce.model.js')).ConsumedOAuthNonce;

    await NonceModel.create({
      nonce: checked.nonce,
      tenantId: checked.tenantId,
      provider: checked.provider,
      expiresAt: new Date(checked.exp),
    });

    consumedStateNonces.set(checked.nonce, checked.exp);
    return checked;
  } catch (err) {
    if (err && (err.code === 11000 || (typeof err.message === 'string' && err.message.includes('E11000')))) {
      consumedStateNonces.set(checked.nonce, checked.exp);
      return {
        valid: false,
        code: 'OAUTH_STATE_REPLAY',
        error: 'OAuth state token has already been consumed (replay attack detected).',
      };
    }

    // Fail-closed: never allow unverified OAuth state consumption if durable nonce store fails
    return {
      valid: false,
      code: 'OAUTH_STATE_STORE_UNAVAILABLE',
      error: 'OAuth state replay verification store is unavailable. Please retry authorization.',
    };
  }
};
