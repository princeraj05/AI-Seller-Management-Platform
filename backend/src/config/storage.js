/**
 * Storage policy for product images.
 *
 * Modes:
 *  - 'cloudinary'  : Cloudinary credentials configured (required in production)
 *  - 'local'       : Local disk (development only, or production with explicit persistent disk opt-in)
 *  - 'unavailable' : Production without persistent storage -> uploads must be rejected
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const isProductionEnv = () => (process.env.NODE_ENV || 'development') === 'production';

export const isCloudinaryConfigured = () =>
  Boolean(
    (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME) &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

/** Explicit opt-in for a persistent mounted disk in production (e.g. Render Disk). */
export const isPersistentLocalAllowed = () =>
  process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION === 'true' && Boolean(process.env.PERSISTENT_UPLOAD_DIR);

export const getLocalUploadRoot = () =>
  process.env.PERSISTENT_UPLOAD_DIR
    ? path.resolve(process.env.PERSISTENT_UPLOAD_DIR)
    : path.resolve(__dirname, '../../uploads');

export const getStorageMode = () => {
  if (isCloudinaryConfigured()) return 'cloudinary';
  if (!isProductionEnv()) return 'local';
  if (isPersistentLocalAllowed()) return 'local';
  return 'unavailable';
};

export const isLocalOrRelativeUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim().toLowerCase();
  return (
    u.startsWith('/') ||
    u.startsWith('uploads/') ||
    u.includes('://localhost') ||
    u.includes('://127.0.0.1') ||
    u.includes('://0.0.0.0')
  );
};

export const isPublicHttpsUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && !isLocalOrRelativeUrl(url);
  } catch {
    return false;
  }
};

export class StorageError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
