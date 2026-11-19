import React, { useEffect, useState } from 'react';
import { ImageOff, Package } from 'lucide-react';
import { resolveProductImageUrl } from '../../utils/imageUrl';

/**
 * Shared product image renderer.
 * Shows a neutral icon placeholder (never a stock photo) when no image exists or it fails to load.
 */
export default function ProductImage({ src, alt = 'Product', className = '', fit = 'cover', iconClassName = 'w-5 h-5' }) {
  const resolved = resolveProductImageUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [resolved]);

  if (!resolved || failed) {
    const Icon = resolved ? ImageOff : Package;
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 ${className}`}
        title={resolved ? 'Image unavailable' : 'No image'}
        role="img"
        aria-label={resolved ? `${alt} (image unavailable)` : `${alt} (no image)`}
      >
        <Icon className={iconClassName} />
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
    />
  );
}
