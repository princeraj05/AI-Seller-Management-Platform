/**
 * Canonical product image resolver (single source of truth).
 *
 * - Returns the real image URL or `null`. It NEVER substitutes a stock/generic photo.
 * - Relative `/uploads/...` paths (development storage) are prefixed with the backend asset
 *   origin so they also work when frontend and backend are on different hosts.
 * - Legacy fake `res.cloudinary.com/demo/...` URLs produced by an earlier local-fallback build
 *   are mapped back to the real locally stored file they point to.
 */

const deriveAssetBase = () => {
  const explicit = import.meta.env.VITE_ASSET_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const api = import.meta.env.VITE_API_BASE_URL || '';
  if (/^https?:\/\//i.test(api)) return api.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  return ''; // same origin (Vite dev proxy forwards /uploads)
};

export const ASSET_BASE_URL = deriveAssetBase();

export function extractImageUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img.trim();
  return String(img.secure_url || img.url || '').trim();
}

export function resolveProductImageUrl(img) {
  const url = extractImageUrl(img);
  if (!url) return null;

  // Legacy fake Cloudinary demo URL -> real local file
  if (url.includes('res.cloudinary.com/demo/image/upload')) {
    const m = url.match(/([a-zA-Z0-9_-]+_prod_\d+_[a-f0-9]+\.(?:jpg|jpeg|png|webp))/i);
    if (m) return `${ASSET_BASE_URL}/uploads/products/${m[1]}`;
  }

  if (url.startsWith('uploads/')) return `${ASSET_BASE_URL}/${url}`;
  if (url.startsWith('/uploads/')) return `${ASSET_BASE_URL}${url}`;
  return url;
}

/** True if the stored URL is only reachable from local development storage. */
export function isLocalDevImage(img) {
  const url = extractImageUrl(img);
  return url.startsWith('/uploads/') || url.startsWith('uploads/') || /:\/\/(localhost|127\.0\.0\.1)/i.test(url);
}
