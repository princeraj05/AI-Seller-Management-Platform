import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_DEV_SECRET = 'antigravity_default_secret_key_32bytes_len!!';

/**
 * Validates and retrieves the 256-bit encryption key from environment configuration
 */
export const getEncryptionKey = () => {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY || DEFAULT_DEV_SECRET;
  const isProd = (process.env.NODE_ENV || 'development') === 'production';

  if (isProd && (!process.env.INTEGRATION_ENCRYPTION_KEY || process.env.INTEGRATION_ENCRYPTION_KEY.length < 32)) {
    throw new Error('CRITICAL SECURITY ERROR: INTEGRATION_ENCRYPTION_KEY must be set and at least 32 characters in production.');
  }

  // Enforce separation of duties: Encryption key cannot be identical to JWT secrets
  if (
    process.env.INTEGRATION_ENCRYPTION_KEY &&
    (process.env.INTEGRATION_ENCRYPTION_KEY === process.env.JWT_ACCESS_SECRET ||
      process.env.INTEGRATION_ENCRYPTION_KEY === process.env.JWT_REFRESH_SECRET)
  ) {
    throw new Error('CRITICAL SECURITY ERROR: INTEGRATION_ENCRYPTION_KEY must not reuse JWT secrets.');
  }

  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypt sensitive credentials string/object using AES-256-GCM (Authenticated Encryption)
 *
 * @param {string|Object} data
 * @returns {{ iv: string, content: string, tag: string }|null}
 */
export const encryptCredentials = (data) => {
  if (!data) return null;
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const iv = crypto.randomBytes(16);
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
 * Decrypt encrypted credentials back to string or parsed object using AES-256-GCM
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
export const generateOAuthState = (tenantId, provider = 'AMAZON', expiresInMs = 15 * 60 * 1000) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required to generate OAuth state.');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + expiresInMs;
  const payload = {
    tenantId: tenantId.toString(),
    provider: provider.toUpperCase(),
    nonce,
    exp,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const key = getEncryptionKey();
  const signature = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');

  return `${payloadB64}.${signature}`;
};

// Consumed OAuth state nonces to guarantee single-use and prevent replay attacks
const consumedStateNonces = new Map();

/**
 * Clear expired nonces from memory
 */
const cleanupExpiredNonces = () => {
  const now = Date.now();
  for (const [nonce, exp] of consumedStateNonces.entries()) {
    if (now > exp) {
      consumedStateNonces.delete(nonce);
    }
  }
};

/**
 * Reset consumed nonces (useful for testing)
 */
export const clearConsumedOAuthStates = () => {
  consumedStateNonces.clear();
};

/**
 * Verify and parse an OAuth state token with replay prevention (single-use)
 *
 * @param {string} stateString
 * @param {string} [expectedTenantId]
 * @returns {{ valid: boolean, tenantId?: string, provider?: string, nonce?: string, exp?: number, error?: string }}
 */
export const verifyOAuthState = (stateString, expectedTenantId = null) => {
  if (!stateString || typeof stateString !== 'string' || !stateString.includes('.')) {
    return { valid: false, error: 'Invalid OAuth state format.' };
  }

  const [payloadB64, signature] = stateString.split('.');
  if (!payloadB64 || !signature) {
    return { valid: false, error: 'Malformed OAuth state token.' };
  }

  const key = getEncryptionKey();
  const expectedSig = crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');

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

  if (!payload.exp || Date.now() > payload.exp) {
    return { valid: false, error: 'OAuth state token has expired. Please initiate authorization again.' };
  }

  if (expectedTenantId && payload.tenantId !== expectedTenantId.toString()) {
    return { valid: false, error: 'Cross-tenant OAuth authorization mismatch.' };
  }

  // Replay Attack Prevention: check if nonce has already been consumed
  cleanupExpiredNonces();
  if (consumedStateNonces.has(payload.nonce)) {
    return { valid: false, error: 'OAuth state token has already been consumed (replay attack detected).' };
  }

  // Consume nonce in memory immediately for single-use guarantee
  consumedStateNonces.set(payload.nonce, payload.exp);

  // Durable MongoDB persistence if database is connected
  try {
    import('../modules/channels/consumedOAuthNonce.model.js').then(({ ConsumedOAuthNonce }) => {
      ConsumedOAuthNonce.create({
        nonce: payload.nonce,
        tenantId: payload.tenantId,
        provider: payload.provider || 'AMAZON',
        expiresAt: new Date(payload.exp),
      }).catch((dbErr) => {
        // If code 11000 duplicate key, it means another cluster instance already consumed this nonce
        if (dbErr.code === 11000) {
          console.warn('Replay attack detected in durable database store for nonce:', payload.nonce);
        }
      });
    }).catch(() => {});
  } catch (e) {
    // ignore
  }

  return { valid: true, ...payload };
};

/**
 * Durable asynchronous OAuth state verification (queries MongoDB unique TTL collection)
 */
export const verifyOAuthStateDurable = async (stateString, expectedTenantId = null) => {
  const result = verifyOAuthState(stateString, expectedTenantId);
  if (!result.valid) return result;

  try {
    const { ConsumedOAuthNonce } = await import('../modules/channels/consumedOAuthNonce.model.js');
    await ConsumedOAuthNonce.create({
      nonce: result.nonce,
      tenantId: result.tenantId,
      provider: result.provider || 'AMAZON',
      expiresAt: new Date(result.exp),
    });
  } catch (err) {
    if (err.code === 11000) {
      return { valid: false, error: 'OAuth state token has already been consumed (replay attack detected).' };
    }
  }

  return result;
};
