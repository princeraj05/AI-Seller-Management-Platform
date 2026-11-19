import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getStorageMode, getLocalUploadRoot, StorageError } from './storage.js';

export const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || '';
  const apiKey = process.env.CLOUDINARY_API_KEY || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
  return { cloudName, apiKey, apiSecret, isConfigured: Boolean(cloudName && apiKey && apiSecret) };
};

const detectFormat = (mimeType = '') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
};

/**
 * Upload directly to Cloudinary (signed, server-side). Throws on failure — never falls back silently.
 */
export const uploadBufferOrDataUriToCloudinary = async ({ sellerId, dataUri, folder = 'products' }) => {
  const { cloudName, apiKey, apiSecret, isConfigured } = getCloudinaryConfig();
  if (!isConfigured) {
    throw new StorageError('STORAGE_NOT_CONFIGURED', 'Cloudinary is not configured.', 503);
  }
  const timestamp = Math.round(Date.now() / 1000);
  const targetFolder = `sellers/${sellerId}/${folder}`;
  const signature = crypto
    .createHash('sha1')
    .update(`folder=${targetFolder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('folder', targetFolder);
  formData.append('signature', signature);

  let response;
  let result;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    result = await response.json();
  } catch (err) {
    throw new StorageError('STORAGE_UPLOAD_FAILED', `Cloudinary network error: ${err.message}`, 502);
  }

  if (!response.ok || !result?.secure_url) {
    throw new StorageError(
      'STORAGE_UPLOAD_FAILED',
      `Cloudinary upload failed: ${result?.error?.message || `HTTP ${response.status}`}`,
      502
    );
  }

  return {
    url: result.secure_url,
    secure_url: result.secure_url,
    public_id: result.public_id,
    format: result.format,
    bytes: result.bytes || 0,
    width: result.width,
    height: result.height,
    provider: 'CLOUDINARY',
  };
};

/**
 * Upload a product image according to the environment storage policy.
 * - cloudinary  -> Cloudinary (errors propagate)
 * - local       -> development disk (or explicitly configured persistent disk)
 * - unavailable -> rejected with 503
 */
export const uploadImageToCloudinary = async ({
  sellerId,
  dataUri,
  fileName = 'image.jpg',
  mimeType = 'image/jpeg',
  folder = 'products',
}) => {
  if (!sellerId) {
    throw new Error('Tenant sellerId is required for secure image upload.');
  }

  const mode = getStorageMode();

  if (mode === 'cloudinary') {
    return uploadBufferOrDataUriToCloudinary({ sellerId, dataUri, folder });
  }

  if (mode === 'unavailable') {
    throw new StorageError(
      'STORAGE_NOT_CONFIGURED',
      'Image storage is not configured for production. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      503
    );
  }

  // Local mode (development / explicit persistent disk)
  const format = detectFormat(mimeType);
  const cleanBaseName = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueId = `prod_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const storedFileName = `${cleanBaseName}_${uniqueId}.${format}`;
  const tenantDir = path.join(getLocalUploadRoot(), 'products');
  fs.mkdirSync(tenantDir, { recursive: true });

  const base64Data = dataUri.startsWith('data:') ? dataUri.replace(/^data:[^;]+;base64,/, '') : dataUri;
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(path.join(tenantDir, storedFileName), buffer);

  const localUrl = `/uploads/products/${storedFileName}`;
  return {
    url: localUrl,
    secure_url: localUrl,
    local_url: localUrl,
    public_id: `sellers/${sellerId}/${folder}/${cleanBaseName}_${uniqueId}`,
    format,
    bytes: buffer.length,
    provider: 'LOCAL_DEV',
  };
};
