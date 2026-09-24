import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_SECRET = 'antigravity_default_secret_key_32bytes_len!!';

const getEncryptionKey = () => {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY || DEFAULT_SECRET;
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypt sensitive credentials string/object into IV + authTag + ciphertext format
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
 * Decrypt encrypted credentials back to string or parsed object
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
    } catch (jsonErr) {
      return decrypted;
    }
  } catch (err) {
    console.error('Credential Decryption Failed:', err.message);
    throw new Error('Failed to decrypt channel credentials');
  }
};
