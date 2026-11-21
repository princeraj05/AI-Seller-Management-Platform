/**
 * Pure data-integrity, image-selection, and validation-clarity helpers for AmazonListingPublisher.
 *
 * Guarantees:
 * - Only uses the selected product's own image URLs (preserving Cloudinary HTTPS URLs).
 * - Never substitutes another product's image or a stock placeholder photo.
 * - Missing or invalid image URLs map cleanly to a neutral product-image placeholder.
 * - Always exposes structured attribute-level validation errors with clear reasons.
 * - Strictly distinguishes official Amazon SP-API schema validation from development fallback
 *   or internal validation.
 */

export const ATTRIBUTE_LABELS = {
  productId: 'Master Product',
  productType: 'Amazon Product Type',
  title: 'Product Title',
  item_name: 'Product Title',
  brand: 'Brand Name',
  sellerSku: 'Amazon Seller SKU',
  description: 'Product Description',
  bulletPoints: 'Bullet Points',
  bullet_point: 'Bullet Points',
  price: 'Amazon Listing Price (INR)',
  standard_price: 'Amazon Listing Price (INR)',
  quantity: 'Allocated Amazon Quantity',
  mainImage: 'Main Product Image',
  main_image: 'Main Product Image',
  otherImages: 'Additional Product Image',
  externalProductId: 'GTIN / Barcode',
  standard_product_id: 'GTIN / Barcode',
  country_of_origin: 'Country of Origin',
  countryOfOrigin: 'Country of Origin',
};

export function formatAttributeLabel(attribute) {
  if (!attribute || typeof attribute !== 'string') return 'General';
  if (ATTRIBUTE_LABELS[attribute]) return ATTRIBUTE_LABELS[attribute];
  if (attribute.startsWith('other_product_image_locator_')) {
    const idx = attribute.replace('other_product_image_locator_', '');
    return `Additional Product Image #${idx}`;
  }
  return attribute
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractProductImageUrl(rawImage) {
  if (!rawImage) return '';
  if (typeof rawImage === 'string') return rawImage.trim();
  if (typeof rawImage === 'object') {
    return String(rawImage.secure_url || rawImage.url || '').trim();
  }
  return '';
}

/**
 * Extracts ONLY the selected product's own image URLs.
 * Preserves Cloudinary secure_url / HTTPS URLs and never substitutes stock photos or other products' images.
 */
export function selectProductImages(product) {
  if (!product || typeof product !== 'object') {
    return { mainImage: '', otherImages: [], allImages: [] };
  }

  const rawList = Array.isArray(product.images) ? product.images : [];
  const seen = new Set();
  const urls = [];

  for (const item of rawList) {
    const url = extractProductImageUrl(item);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return {
    mainImage: urls[0] || '',
    otherImages: urls.slice(1),
    allImages: urls,
  };
}

function isPrivateOrLocalHostname(hostname) {
  const h = String(hostname || '').toLowerCase().trim();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  );
}

/**
 * Inspects a product image URL for safe UI rendering and Amazon SP-API compatibility.
 * Missing or invalid URLs return displayable: false so UI renders a neutral placeholder.
 */
export function inspectListingImageUrl(rawImage, assetBaseUrl = '') {
  const url = extractProductImageUrl(rawImage);
  if (!url) {
    return {
      status: 'missing',
      displayable: false,
      resolvedUrl: null,
      amazonEligible: false,
      isCloudinary: false,
      isLocalUpload: false,
      reason: 'No product image URL is configured for this product.',
    };
  }

  const lower = url.toLowerCase();

  if (lower.startsWith('blob:') || lower.startsWith('data:') || lower.startsWith('javascript:')) {
    return {
      status: 'invalid',
      displayable: false,
      resolvedUrl: null,
      amazonEligible: false,
      isCloudinary: false,
      isLocalUpload: false,
      reason: 'Amazon rejects blob:, data:, and script URLs. Use a permanently hosted public HTTPS image URL.',
    };
  }

  if (
    lower.startsWith('file:') ||
    /^[a-zA-Z]:[\\/]/.test(url) ||
    url.startsWith('./') ||
    url.startsWith('../') ||
    (url.startsWith('/') && !url.startsWith('/uploads/'))
  ) {
    return {
      status: 'invalid',
      displayable: false,
      resolvedUrl: null,
      amazonEligible: false,
      isCloudinary: false,
      isLocalUpload: false,
      reason: 'Local filesystem paths cannot be displayed or submitted to Amazon. Use a public HTTPS image URL.',
    };
  }

  if (lower.startsWith('http://')) {
    return {
      status: 'invalid',
      displayable: false,
      resolvedUrl: null,
      amazonEligible: false,
      isCloudinary: false,
      isLocalUpload: false,
      reason: 'Amazon requires secure HTTPS image links. Insecure HTTP URLs are rejected.',
    };
  }

  const cleanBase = String(assetBaseUrl || '').replace(/\/+$/, '');

  // Legacy local-fallback Cloudinary demo URL pointing to a real local upload filename
  if (url.includes('res.cloudinary.com/demo/image/upload')) {
    const match = url.match(/([a-zA-Z0-9_-]+_prod_\d+_[a-f0-9]+\.(?:jpg|jpeg|png|webp))/i);
    if (match) {
      return {
        status: 'local_dev',
        displayable: true,
        resolvedUrl: `${cleanBase}/uploads/products/${match[1]}`,
        amazonEligible: false,
        isCloudinary: false,
        isLocalUpload: true,
        reason: 'Legacy local upload asset. Previewable locally, but Amazon SP-API requires a public HTTPS URL (e.g. Cloudinary).',
      };
    }
  }

  // Local development uploads
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return {
      status: 'local_dev',
      displayable: true,
      resolvedUrl: `${cleanBase}${cleanPath}`,
      amazonEligible: false,
      isCloudinary: false,
      isLocalUpload: true,
      reason: 'Local development upload path (/uploads/...). Previewable locally, but Amazon SP-API requires a public HTTPS URL (e.g. Cloudinary).',
    };
  }

  // Public HTTPS URLs (including Cloudinary secure_url)
  if (lower.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (isPrivateOrLocalHostname(parsed.hostname)) {
        return {
          status: 'invalid',
          displayable: false,
          resolvedUrl: null,
          amazonEligible: false,
          isCloudinary: false,
          isLocalUpload: false,
          reason: 'Amazon rejects localhost and private-network image URLs. Use a publicly accessible HTTPS URL.',
        };
      }
      const isCloudinary =
        parsed.hostname === 'res.cloudinary.com' &&
        !parsed.pathname.toLowerCase().startsWith('/demo/');
      return {
        status: 'valid_https',
        displayable: true,
        resolvedUrl: url,
        amazonEligible: true,
        isCloudinary,
        isLocalUpload: false,
        reason: null,
      };
    } catch {
      return {
        status: 'invalid',
        displayable: false,
        resolvedUrl: null,
        amazonEligible: false,
        isCloudinary: false,
        isLocalUpload: false,
        reason: 'Malformed HTTPS image URL.',
      };
    }
  }

  return {
    status: 'invalid',
    displayable: false,
    resolvedUrl: null,
    amazonEligible: false,
    isCloudinary: false,
    isLocalUpload: false,
    reason: 'Invalid image URL format. Amazon requires a publicly accessible HTTPS image URL.',
  };
}

function inferAttributeFromCode(code) {
  if (!code || typeof code !== 'string') return 'general';
  const c = code.toUpperCase();
  if (c.includes('PRODUCT_TYPE')) return 'productType';
  if (c.includes('PRODUCT_ID') || c === 'PRODUCT_NOT_FOUND') return 'productId';
  if (c.includes('TITLE')) return 'title';
  if (c.includes('BRAND')) return 'brand';
  if (c.includes('SKU')) return 'sellerSku';
  if (c.includes('DESCRIPTION')) return 'description';
  if (c.includes('PRICE')) return 'price';
  if (c.includes('QUANTITY')) return 'quantity';
  if (c.includes('IMAGE')) return 'mainImage';
  if (c.includes('GTIN')) return 'externalProductId';
  return 'general';
}

export function formatValidationSourceLabel(source) {
  switch (source) {
    case 'OFFICIAL_AMAZON_SCHEMA':
    case 'AMAZON_SP_API':
      return 'Official Amazon Schema';
    case 'DEVELOPMENT_FALLBACK_SCHEMA':
    case 'DEVELOPMENT_FALLBACK':
      return 'Development Fallback Schema';
    case 'INTERNAL_VALIDATION':
    default:
      return 'Internal Validation';
  }
}

/**
 * Resolves honest UI badge/banner metadata for the schema validation source.
 * Green official verification is ONLY returned for AMAZON_SP_API.
 */
export function resolveSchemaValidationBadge(schemaSource) {
  if (schemaSource === 'AMAZON_SP_API' || schemaSource === 'OFFICIAL_AMAZON_SCHEMA') {
    return {
      isOfficial: true,
      tone: 'official',
      badgeText: 'OFFICIAL AMAZON SP-API (v2020-09-01)',
      title: 'Official Amazon Schema Validation',
      description: 'Validated against the official Amazon Product Type Definitions API v2020-09-01 schema.',
    };
  }

  if (schemaSource === 'DEVELOPMENT_FALLBACK' || schemaSource === 'DEVELOPMENT_FALLBACK_SCHEMA') {
    return {
      isOfficial: false,
      tone: 'fallback',
      badgeText: 'DEVELOPMENT FALLBACK (NOT OFFICIAL AMAZON SCHEMA)',
      title: 'Development Fallback Validation (Not Official Amazon Schema)',
      description:
        'Validated using internal rules and a local development fallback schema because Amazon Sandbox does not provide dynamic India Product Type Definitions. This is NOT an official Amazon SP-API schema verification.',
    };
  }

  return {
    isOfficial: false,
    tone: 'internal',
    badgeText: 'INTERNAL VALIDATION ONLY',
    title: 'Internal Validation Only (No Official Amazon Schema Evaluated)',
    description:
      'Only internal listing attribute checks were evaluated. An official Amazon Product Type schema has not been applied.',
  };
}

/**
 * Normalizes any validation API response (HTTP 200, 400, 422, or error object)
 * into a predictable structure with explicit attribute-level errors and truthful schema source.
 */
export function normalizeListingValidationResponse(rawResponse, fallbackSchemaData = null) {
  const payload =
    rawResponse && typeof rawResponse === 'object'
      ? rawResponse.data && typeof rawResponse.data === 'object' && !Array.isArray(rawResponse.data)
        ? { ...rawResponse, ...rawResponse.data }
        : rawResponse
      : {};

  const rawIssues = Array.isArray(payload.issues)
    ? payload.issues
    : [
        ...(Array.isArray(payload.errors) ? payload.errors : []),
        ...(Array.isArray(payload.warnings) ? payload.warnings : []),
      ];

  const normalizedIssues = rawIssues
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const attr = item.attribute || item.attributeName || inferAttributeFromCode(item.code);
      return {
        code: item.code || 'VALIDATION_ERROR',
        severity: item.severity === 'WARNING' ? 'WARNING' : 'ERROR',
        attribute: attr,
        attributeName: item.attributeName || attr,
        attributeLabel: formatAttributeLabel(attr),
        message: item.message || 'Validation requirement not met.',
        source: item.source || 'INTERNAL_VALIDATION',
      };
    });

  let errors = normalizedIssues.filter((i) => i.severity === 'ERROR');
  const warnings = normalizedIssues.filter((i) => i.severity === 'WARNING');

  const explicitValid = payload.valid === true;

  // Never allow an invalid/failed response with zero visible reasons
  if (!explicitValid && errors.length === 0) {
    const inferredAttr = inferAttributeFromCode(payload.code);
    const synthesizedError = {
      code: payload.code || 'VALIDATION_FAILED',
      severity: 'ERROR',
      attribute: inferredAttr,
      attributeName: inferredAttr,
      attributeLabel: formatAttributeLabel(inferredAttr),
      message:
        payload.message ||
        'Listing validation failed. Please review required fields and try validating again.',
      source: 'INTERNAL_VALIDATION',
    };
    errors = [synthesizedError];
    normalizedIssues.push(synthesizedError);
  }

  const schemaSource =
    payload.schemaSource ||
    (payload.success === false ? 'INTERNAL_VALIDATION' : fallbackSchemaData?.schemaSource) ||
    'INTERNAL_VALIDATION';

  const validationSource =
    payload.validationSource ||
    (schemaSource === 'AMAZON_SP_API'
      ? 'OFFICIAL_AMAZON_SCHEMA'
      : schemaSource === 'DEVELOPMENT_FALLBACK'
      ? 'DEVELOPMENT_FALLBACK_SCHEMA'
      : 'INTERNAL_VALIDATION');

  return {
    valid: explicitValid && errors.length === 0,
    errors,
    warnings,
    issues: normalizedIssues,
    schemaSource,
    validationSource,
    schemaNote: payload.schemaNote || resolveSchemaValidationBadge(schemaSource).description,
    payloadPreview: payload.payloadPreview || null,
    message: payload.message || null,
  };
}

/**
 * Determines whether Proceed to Submission / Step 7 may be enabled.
 * Strictly requires a fresh, passing validation result with zero blocking errors.
 */
export function canProceedToListingSubmission(validationResult, { validating = false, isStale = false } = {}) {
  if (validating || isStale) return false;
  if (!validationResult || validationResult.valid !== true) return false;
  if (Array.isArray(validationResult.errors) && validationResult.errors.length > 0) return false;
  return true;
}
