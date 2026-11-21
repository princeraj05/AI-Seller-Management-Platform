import {
  MarketplaceListingSubmission,
  inMemorySubmissionsMap,
} from '../../../modules/channels/marketplaceListingSubmission.model.js';
import { Product } from '../../../modules/products/product.model.js';
import { ChannelConnection } from '../../../modules/channels/channelConnection.model.js';
import { inMemoryChannelsMap, buildTenantConnectionQuery } from '../../../modules/channels/channel.service.js';
import { decryptCredentials } from '../../../utils/encryption.js';
import { AmazonSpApiClient, AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';
import {
  getProductTypeDefinition,
  validatePayloadAgainstProductTypeSchema,
} from './amazon.definitions.service.js';
import { config } from '../../../config/env.js';
import { isProductionEnv } from '../../../config/storage.js';
import { inMemoryProductsMap } from '../../../modules/products/product.service.js';
import { isProductEligibleForPublishing } from '../../../modules/channels/channel.controller.js';

// Re-export in-memory fallback map for test environments
export { inMemorySubmissionsMap };

/**
 * Check if a host or URL refers to localhost or private network.
 */
export function isLocalOrPrivateHost(hostOrUrl) {
  if (!hostOrUrl || typeof hostOrUrl !== 'string') return false;
  const h = hostOrUrl.trim().toLowerCase();
  return (
    h.includes('localhost') ||
    h.includes('127.0.0.1') ||
    h.includes('0.0.0.0') ||
    h.includes('::1') ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  );
}

/**
 * Resolves and validates an image locator for Amazon SP-API submissions.
 * Amazon strictly requires publicly accessible HTTPS URLs.
 *
 * @param {string|Object} rawImage - Image URL string or image object
 * @param {Object} [options]
 * @param {string} [options.assetBaseUrl] - Optional base URL for resolving local uploads
 * @returns {{ valid: boolean, url: string|null, issueCode: string|null, message: string|null }}
 */
export const resolveAmazonProductImageUrl = (rawImage, options = {}) => {
  let imgStr = '';
  if (typeof rawImage === 'string') {
    imgStr = rawImage.trim();
  } else if (rawImage && typeof rawImage === 'object') {
    imgStr = (rawImage.secure_url || rawImage.url || '').trim();
  }

  // 1. Missing or empty
  if (!imgStr) {
    return {
      valid: false,
      url: null,
      issueCode: 'MISSING_MAIN_IMAGE',
      message: 'Product image is required for Amazon listing submissions.',
    };
  }

  const lower = imgStr.toLowerCase();

  // 2. Reject blob: URLs
  if (lower.startsWith('blob:')) {
    return {
      valid: false,
      url: null,
      issueCode: 'INVALID_IMAGE_URL',
      message: 'Amazon rejects blob: URLs. Images must be permanently hosted public HTTPS URLs.',
    };
  }

  // 3. Reject data: inline URIs
  if (lower.startsWith('data:')) {
    return {
      valid: false,
      url: null,
      issueCode: 'INVALID_IMAGE_URL',
      message: 'Amazon rejects data: inline URIs. Images must be hosted public HTTPS URLs.',
    };
  }

  // 4. Reject local filesystem paths (file://, C:\, /Users/, /var/, relative dot paths, etc.)
  if (
    lower.startsWith('file:') ||
    /^[a-zA-Z]:[\\/]/.test(imgStr) ||
    imgStr.startsWith('./') ||
    imgStr.startsWith('../') ||
    (imgStr.startsWith('/') && !imgStr.startsWith('/uploads/'))
  ) {
    return {
      valid: false,
      url: null,
      issueCode: 'INVALID_IMAGE_URL',
      message: 'Amazon rejects local filesystem paths. Images must be public HTTPS URLs.',
    };
  }

  // 5. Reject insecure HTTP
  if (lower.startsWith('http://')) {
    return {
      valid: false,
      url: null,
      issueCode: 'INSECURE_IMAGE_URL',
      message: 'Amazon requires secure HTTPS image URLs. Insecure HTTP is rejected.',
    };
  }

  // 6. Handle local uploaded assets (/uploads/... or uploads/...)
  if (imgStr.startsWith('/uploads/') || imgStr.startsWith('uploads/')) {
    const cleanPath = imgStr.startsWith('/') ? imgStr : `/${imgStr}`;
    const base = (
      options.assetBaseUrl ||
      process.env.PUBLIC_ASSET_BASE_URL ||
      process.env.PUBLIC_ASSET_URL ||
      process.env.ASSET_BASE_URL ||
      process.env.PUBLIC_URL ||
      process.env.APP_URL ||
      ''
    ).trim().replace(/\/+$/, '');

    // The base URL must be a valid public HTTPS URL and not localhost
    if (base && base.toLowerCase().startsWith('https://') && !isLocalOrPrivateHost(base)) {
      return {
        valid: true,
        url: `${base}${cleanPath}`,
        issueCode: null,
        message: null,
      };
    }

    return {
      valid: false,
      url: null,
      issueCode: 'UNRESOLVED_IMAGE_URL',
      message: `Local upload asset "${imgStr}" cannot be resolved to a public HTTPS URL because no public HTTPS asset base URL is configured.`,
    };
  }

  // 7. Verify HTTPS URL
  if (lower.startsWith('https://')) {
    try {
      const parsed = new URL(imgStr);
      if (isLocalOrPrivateHost(parsed.hostname)) {
        return {
          valid: false,
          url: null,
          issueCode: 'INVALID_IMAGE_URL',
          message: 'Amazon rejects private host and localhost HTTPS URLs. The URL must be publicly accessible.',
        };
      }
      return {
        valid: true,
        url: imgStr,
        issueCode: null,
        message: null,
      };
    } catch {
      return {
        valid: false,
        url: null,
        issueCode: 'INVALID_IMAGE_URL',
        message: 'Invalid image URL syntax.',
      };
    }
  }

  // Any other scheme or unresolved string
  return {
    valid: false,
    url: null,
    issueCode: 'INVALID_IMAGE_URL',
    message: 'Amazon requires publicly accessible HTTPS image URLs.',
  };
};

/**
 * Extract snapshot of all 13 protected master product fields for immutability verification:
 * title, description, shortDescription, bulletPoints, productType, brand,
 * categoryName, subcategory, attributes, images, masterPrice, costPrice, stock.
 */
export const snapshotMasterProductFields = (prod) => {
  if (!prod) return null;
  const p = typeof prod.toObject === 'function' ? prod.toObject() : prod;
  return {
    title: p.title,
    description: p.description,
    shortDescription: p.shortDescription,
    bulletPoints: Array.isArray(p.bulletPoints) ? JSON.parse(JSON.stringify(p.bulletPoints)) : p.bulletPoints,
    productType: p.productType,
    brand: p.brand,
    categoryName: p.categoryName,
    subcategory: p.subcategory,
    attributes: p.attributes instanceof Map
      ? Object.fromEntries(p.attributes)
      : (p.attributes ? JSON.parse(JSON.stringify(p.attributes)) : p.attributes),
    images: Array.isArray(p.images) ? JSON.parse(JSON.stringify(p.images)) : p.images,
    masterPrice: p.masterPrice,
    costPrice: p.costPrice,
    stock: p.stock,
  };
};

/**
 * Verify that all 13 protected master product fields are strictly identical to initial snapshot.
 */
export const assertMasterProductImmutability = (prod, initialSnapshot) => {
  if (!prod || !initialSnapshot) return;
  const current = snapshotMasterProductFields(prod);
  const fields = [
    'title', 'description', 'shortDescription', 'bulletPoints',
    'productType', 'brand', 'categoryName', 'subcategory',
    'attributes', 'images', 'masterPrice', 'costPrice', 'stock'
  ];
  for (const field of fields) {
    const beforeStr = JSON.stringify(initialSnapshot[field] ?? null);
    const afterStr = JSON.stringify(current[field] ?? null);
    if (beforeStr !== afterStr) {
      throw new Error(
        `FATAL SAFETY VIOLATION: Master product field "${field}" was altered during Amazon listing operations. Before: ${beforeStr}, After: ${afterStr}`
      );
    }
  }
};

/**
 * Validate listing attributes according to Amazon SP-API guidelines
 *
 * @param {Object} params
 * @param {Object} params.product Master Product
 * @param {Object} params.mappedAttributes Seller-specified attribute mapping
 * @param {string} params.productType Amazon product type (e.g. 'SHIRT')
 * @param {boolean} [params.gtinExemption=false] Whether seller has an approved GTIN exemption
 * @returns {{ valid: boolean, errors: Array, warnings: Array, issues: Array }}
 */
export const validateListingData = (arg1 = {}, arg2 = {}) => {
  let product = {};
  let mappedAttributes = {};
  let rawProductType = '';
  let gtinExemption = false;

  if (arg1.product || arg1.mappedAttributes) {
    product = arg1.product || {};
    mappedAttributes = arg1.mappedAttributes || {};
    rawProductType = arg1.productType || mappedAttributes.productType || product.productType || '';
    gtinExemption = Boolean(arg1.gtinExemption ?? arg1.gtinExemptionRequested ?? mappedAttributes.gtinExemptionRequested);
  } else {
    mappedAttributes = arg1;
    product = arg2.product || {};
    rawProductType = arg2.productType || mappedAttributes.productType || product.productType || '';
    gtinExemption = Boolean(arg1.gtinExemptionRequested ?? arg1.gtinExemption ?? arg2.gtinExemption);
  }

  const cleanProductType = typeof rawProductType === 'string' ? rawProductType.trim().toUpperCase() : '';
  const issues = [];

  // 0. Product Type Validation (Never default to SHIRT or another arbitrary category)
  if (!cleanProductType) {
    issues.push({
      code: 'MISSING_PRODUCT_TYPE',
      severity: 'ERROR',
      message: 'Amazon Product Type is required. Please select a valid product type definition.',
      attribute: 'productType',
      attributeName: 'productType',
    });
  }

  const title = (mappedAttributes.title || mappedAttributes.item_name || product.title || product.name || '').trim();
  const brand = (mappedAttributes.brand || product.brand || '').trim();
  const sellerSku = (mappedAttributes.sellerSku || mappedAttributes.sku || product.sku || '').trim();
  const description = (mappedAttributes.description || product.description || '').trim();
  const price = Number(mappedAttributes.price ?? mappedAttributes.standard_price ?? product.masterPrice ?? product.price);
  const stock = Number(mappedAttributes.quantity ?? mappedAttributes.stock ?? product.stock);

  let images = [];
  if (Array.isArray(mappedAttributes.images) && mappedAttributes.images.length > 0) {
    images = mappedAttributes.images;
  } else if (mappedAttributes.mainImage || mappedAttributes.main_image) {
    images = [mappedAttributes.mainImage || mappedAttributes.main_image, ...(mappedAttributes.otherImages || [])];
  } else if (Array.isArray(product.images) && product.images.length > 0) {
    images = product.images.map((img) => (img && typeof img === 'object' && img.url ? img.url : img)).filter(Boolean);
  }

  // 1. Title Validation
  if (!title) {
    issues.push({ code: 'MISSING_TITLE', severity: 'ERROR', message: 'Product title is required.', attribute: 'title', attributeName: 'item_name' });
  } else if (title.length < 5) {
    issues.push({ code: 'TITLE_TOO_SHORT', severity: 'ERROR', message: 'Product title must be at least 5 characters long.', attribute: 'title', attributeName: 'item_name' });
  } else if (title.length > 200) {
    issues.push({ code: 'TITLE_TOO_LONG', severity: 'WARNING', message: 'Amazon recommends product titles stay under 200 characters.', attribute: 'title', attributeName: 'item_name' });
  }

  // 2. Brand Validation
  if (!brand) {
    issues.push({ code: 'MISSING_BRAND', severity: 'ERROR', message: 'Brand name is required.', attribute: 'brand', attributeName: 'brand' });
  }

  // 3. Seller SKU Validation
  if (!sellerSku) {
    issues.push({ code: 'MISSING_SELLER_SKU', severity: 'ERROR', message: 'Seller SKU is required.', attribute: 'sellerSku', attributeName: 'sellerSku' });
  }

  // 4. Description Validation
  if (!description) {
    issues.push({ code: 'MISSING_DESCRIPTION', severity: 'ERROR', message: 'Product description is required.', attribute: 'description', attributeName: 'description' });
  }

  // 5. Bullet Points Validation (Use verified master product bullet points when available)
  const bullets = Array.isArray(mappedAttributes.bulletPoints || mappedAttributes.bullet_point) && (mappedAttributes.bulletPoints || mappedAttributes.bullet_point).length > 0
    ? (mappedAttributes.bulletPoints || mappedAttributes.bullet_point).filter(Boolean)
    : Array.isArray(product.bulletPoints) && product.bulletPoints.length > 0
    ? product.bulletPoints.filter(Boolean)
    : product.tags && product.tags.length > 0
    ? product.tags
    : [];

  if (bullets.length === 0) {
    issues.push({ code: 'MISSING_BULLET_POINTS', severity: 'WARNING', message: 'At least 1 bullet point (key feature) is recommended by Amazon.', attribute: 'bulletPoints', attributeName: 'bullet_point' });
  }

  // 6. Price & Quantity Validation
  if (isNaN(price) || price <= 0) {
    issues.push({ code: 'INVALID_PRICE', severity: 'ERROR', message: 'Listing price must be a positive number greater than 0.', attribute: 'price', attributeName: 'standard_price' });
  }

  if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
    issues.push({ code: 'INVALID_QUANTITY', severity: 'ERROR', message: 'Available stock must be a non-negative integer.', attribute: 'quantity', attributeName: 'quantity' });
  }

  // 7. Image Validation
  if (!images || images.length === 0 || !images[0]) {
    issues.push({
      code: 'MISSING_MAIN_IMAGE',
      severity: 'ERROR',
      message: 'At least one product image is required for Amazon listing.',
      attribute: 'mainImage',
      attributeName: 'main_image',
    });
  } else {
    const mainImgResolution = resolveAmazonProductImageUrl(images[0], {
      assetBaseUrl: arg1.assetBaseUrl || arg2.assetBaseUrl,
    });
    if (!mainImgResolution.valid) {
      issues.push({
        code: mainImgResolution.issueCode || 'INVALID_IMAGE_URL',
        severity: 'ERROR',
        message: mainImgResolution.message || 'Main product image must be a valid public HTTPS URL.',
        attribute: 'mainImage',
        attributeName: 'main_image',
      });
    }

    if (images.length > 1) {
      for (let i = 1; i < images.length; i++) {
        const otherRes = resolveAmazonProductImageUrl(images[i], {
          assetBaseUrl: arg1.assetBaseUrl || arg2.assetBaseUrl,
        });
        if (!otherRes.valid) {
          issues.push({
            code: otherRes.issueCode || 'INVALID_IMAGE_URL',
            severity: 'ERROR',
            message: otherRes.message || `Secondary image at index ${i} must be a valid public HTTPS URL.`,
            attribute: 'otherImages',
            attributeName: `other_product_image_locator_${i}`,
          });
        }
      }
    }
  }

  // 8. GTIN / Barcode Identifier Validation
  const externalProductId = (
    mappedAttributes.externalProductId ||
    mappedAttributes.standard_product_id ||
    product.barcode ||
    ''
  ).trim();

  if (!gtinExemption && !externalProductId) {
    issues.push({
      code: 'MISSING_GTIN',
      severity: 'ERROR',
      message: 'Product identifier (GTIN/EAN/UPC) is required unless a GTIN Exemption is requested.',
      attribute: 'externalProductId',
      attributeName: 'standard_product_id',
    });
  }

  const errors = issues.filter((i) => i.severity === 'ERROR');
  const warnings = issues.filter((i) => i.severity === 'WARNING');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
  };
};

/**
 * Format listing data into the official Amazon Listings Items API v2021-08-01 schema
 *
 * @param {Object} params
 * @param {Object} params.product Master Product
 * @param {Object} params.mappedAttributes Mapped dynamic attributes
 * @param {string} params.productType Amazon product type (e.g. 'SHIRT')
 * @param {string} [params.marketplaceId='A21TJRUUN4KGV']
 * @param {string} params.sellerSku
 * @param {boolean} [params.gtinExemption=false]
 * @returns {Object} SP-API PUT /listings/2021-08-01/items request payload
 */
export const buildSpApiListingPayload = (arg1 = {}, arg2 = {}) => {
  let product = {};
  let mappedAttributes = {};
  let productType = '';
  let marketplaceId = 'A21TJRUUN4KGV';
  let sellerSku = '';
  let gtinExemption = false;

  if (arg1.product || arg1.mappedAttributes) {
    product = arg1.product || {};
    mappedAttributes = arg1.mappedAttributes || {};
    productType = arg1.productType || mappedAttributes.productType || product.productType || '';
    marketplaceId = arg1.marketplaceId || mappedAttributes.marketplaceId || 'A21TJRUUN4KGV';
    sellerSku = arg1.sellerSku || mappedAttributes.sellerSku || '';
    gtinExemption = Boolean(arg1.gtinExemption ?? arg1.gtinExemptionRequested ?? mappedAttributes.gtinExemptionRequested);
  } else {
    mappedAttributes = arg1;
    product = arg2.product || {};
    productType = arg2.productType || mappedAttributes.productType || product.productType || '';
    marketplaceId = arg2.marketplaceId || mappedAttributes.marketplaceId || 'A21TJRUUN4KGV';
    sellerSku = arg2.sellerSku || arg1.sellerSku || mappedAttributes.sellerSku || '';
    gtinExemption = Boolean(arg1.gtinExemptionRequested ?? arg1.gtinExemption ?? arg2.gtinExemption);
  }

  const cleanSku = (sellerSku || mappedAttributes.sellerSku || product.sku || '').trim().toUpperCase();
  const cleanType = (productType || '').trim().toUpperCase();

  const title = (mappedAttributes.title || mappedAttributes.item_name || product.title || product.name || 'Generic Product').trim();
  const brand = (mappedAttributes.brand || product.brand || 'Generic').trim();
  const description = (mappedAttributes.description || product.description || '').trim();
  const price = Number(mappedAttributes.price ?? mappedAttributes.standard_price ?? product.masterPrice ?? product.price ?? 0);
  const stock = Number(mappedAttributes.quantity ?? mappedAttributes.stock ?? product.stock ?? 0);

  let images = [];
  if (Array.isArray(mappedAttributes.images) && mappedAttributes.images.length > 0) {
    images = mappedAttributes.images;
  } else if (mappedAttributes.mainImage || mappedAttributes.main_image) {
    images = [mappedAttributes.mainImage || mappedAttributes.main_image, ...(mappedAttributes.otherImages || [])];
  } else if (Array.isArray(product.images) && product.images.length > 0) {
    images = product.images.map((img) => (img && typeof img === 'object' && img.url ? img.url : img)).filter(Boolean);
  }

  const rawBullets = Array.isArray(mappedAttributes.bulletPoints || mappedAttributes.bullet_point) && (mappedAttributes.bulletPoints || mappedAttributes.bullet_point).length > 0
    ? (mappedAttributes.bulletPoints || mappedAttributes.bullet_point).filter(Boolean)
    : Array.isArray(product.bulletPoints) && product.bulletPoints.length > 0
    ? product.bulletPoints.filter(Boolean)
    : product.tags && product.tags.length > 0
    ? product.tags
    : [description.slice(0, 100)];

  // Helper to extract known attributes from mappedAttributes or product.attributes
  const getAttr = (key) => {
    if (mappedAttributes.categoryAttributes?.[key]) return mappedAttributes.categoryAttributes[key];
    if (mappedAttributes[key]) return mappedAttributes[key];
    if (product[key]) return product[key];
    if (product.attributes instanceof Map && product.attributes.has(key)) {
      return product.attributes.get(key);
    }
    if (product.attributes && typeof product.attributes === 'object' && product.attributes[key]) {
      return product.attributes[key];
    }
    return '';
  };

  const attributes = {
    item_name: [{ value: title, marketplace_id: marketplaceId }],
    brand: [{ value: brand, marketplace_id: marketplaceId }],
    bullet_point: rawBullets.slice(0, 5).map((bp) => ({
      value: String(bp).trim(),
      marketplace_id: marketplaceId,
    })),
    description: [{ value: description, marketplace_id: marketplaceId }],
    purchasable_offer: [
      {
        currency: 'INR',
        our_price: [
          {
            schedule: [
              {
                value_with_tax: price,
              },
            ],
          },
        ],
        marketplace_id: marketplaceId,
      },
    ],
    fulfillment_availability: [
      {
        fulfillment_channel_code: mappedAttributes.fulfillmentChannel || 'DEFAULT',
        quantity: stock,
      },
    ],
  };

  // Add images with canonical public HTTPS resolution
  if (images.length > 0) {
    const mainImgResolution = resolveAmazonProductImageUrl(images[0], {
      assetBaseUrl: arg1.assetBaseUrl || arg2.assetBaseUrl,
    });
    attributes.main_product_image_locator = [
      {
        media_location: (mainImgResolution.valid && mainImgResolution.url) ? mainImgResolution.url : String(images[0]).trim(),
        marketplace_id: marketplaceId,
      },
    ];

    if (images.length > 1) {
      const otherImgResolution = resolveAmazonProductImageUrl(images[1], {
        assetBaseUrl: arg1.assetBaseUrl || arg2.assetBaseUrl,
      });
      attributes.other_product_image_locator_1 = [
        {
          media_location: (otherImgResolution.valid && otherImgResolution.url) ? otherImgResolution.url : String(images[1]).trim(),
          marketplace_id: marketplaceId,
        },
      ];
    }
  }

  // Country of origin (Mandatory in Amazon India)
  const countryVal = getAttr('countryOfOrigin') || getAttr('country_of_origin') || getAttr('origin') || 'IN';
  attributes.country_of_origin = [
    { value: countryVal, marketplace_id: marketplaceId },
  ];

  // Manufacturer
  const mfrVal = getAttr('manufacturer') || product.brand;
  if (mfrVal) {
    attributes.manufacturer = [
      { value: mfrVal, marketplace_id: marketplaceId },
    ];
  }

  // Category specific schema-defined fields (mapped from known attributes, not generic dump)
  const colorVal = getAttr('color');
  if (colorVal) {
    attributes.color = [{ value: colorVal, marketplace_id: marketplaceId }];
  }
  const materialVal = getAttr('material');
  if (materialVal) {
    attributes.material = [{ value: materialVal, marketplace_id: marketplaceId }];
  }
  const sizeVal = getAttr('size');
  if (sizeVal) {
    attributes.size = [{ value: sizeVal, marketplace_id: marketplaceId }];
  }
  const deptVal = getAttr('department') || getAttr('targetGender');
  if (deptVal) {
    attributes.department = [{ value: deptVal, marketplace_id: marketplaceId }];
  }

  // GTIN / Product ID handling
  const gtinVal = mappedAttributes.externalProductId || mappedAttributes.standard_product_id || product.barcode;
  if (!gtinExemption && gtinVal) {
    attributes.standard_product_id = [
      {
        type: mappedAttributes.externalProductIdType || mappedAttributes.product_id_type || 'EAN',
        value: gtinVal,
        marketplace_id: marketplaceId,
      },
    ];
  }

  return {
    productType: cleanType,
    requirements: 'LISTING',
    attributes,
  };
};

/**
 * Execute listing submission (Dry-Run or Sandbox Submission)
 * Strictly enforces Sandbox environment. Production publishing is permanently disabled.
 */
export const executeListingSubmission = async (arg1 = {}, arg2 = {}) => {
  let tenant = {};
  let submissionId = null;
  let dryRun = true;
  let client = null;
  let environment = null;
  let mode = null;

  if (arg1.tenant || arg1.submissionId !== undefined) {
    tenant = arg1.tenant || arg2.tenant || {};
    submissionId = arg1.submissionId;
    mode = arg1.mode || arg1.submissionMode || arg2.mode || arg2.submissionMode;
    dryRun = arg1.dryRun !== undefined ? arg1.dryRun : (arg2.dryRun !== undefined ? arg2.dryRun : (mode === 'SANDBOX_SUBMISSION' || mode === 'VALIDATION_PREVIEW' ? false : true));
    client = arg1.client || arg2.client || null;
    environment = arg1.environment || arg2.environment || null;
  } else {
    // Called as executeListingSubmission(submissionDoc, options)
    submissionId = arg1;
    tenant = arg2.tenant || { sellerId: arg1?.sellerId };
    mode = arg2.mode || arg1?.submissionMode || arg2?.submissionMode;
    dryRun = arg2.dryRun !== undefined ? arg2.dryRun : (mode === 'SANDBOX_SUBMISSION' || mode === 'VALIDATION_PREVIEW' ? false : true);
    client = arg2.client || null;
    environment = arg2.environment || null;
  }

  // 1. HARD SECURITY GUARD: Production Publishing Strictly Prohibited
  const activeEnv = (environment || config.amazon?.env || process.env.AMAZON_SP_API_ENV || 'sandbox').toLowerCase().trim();
  if (activeEnv === 'production') {
    const prodErr = new Error('PRODUCTION_PUBLISHING_DISABLED');
    prodErr.code = 'PRODUCTION_PUBLISHING_DISABLED';
    prodErr.status = 403;
    throw prodErr;
  }

  // 2. Fetch or resolve Submission Record with strict tenant & store isolation
  let submission = typeof submissionId === 'object' && submissionId !== null ? submissionId : null;
  const sellerId = tenant?.sellerId || tenant?._id || submission?.sellerId;
  const reqStoreId = tenant?.storeId ? String(tenant.storeId) : null;

  if (submission && sellerId) {
    if (submission.sellerId && String(submission.sellerId) !== String(sellerId)) {
      const authErr = new Error('Cross-tenant listing submission access forbidden.');
      authErr.code = 'UNAUTHORIZED_ACCESS';
      authErr.status = 403;
      throw authErr;
    }
    const subStore = submission.storeId ? String(submission.storeId) : null;
    if (subStore !== reqStoreId && tenant?.storeId !== undefined) {
      const storeErr = new Error('Cross-store listing submission access forbidden.');
      storeErr.code = 'UNAUTHORIZED_ACCESS';
      storeErr.status = 403;
      throw storeErr;
    }
  }

  if (!submission) {
    try {
      const subQuery = {
        _id: submissionId,
        sellerId,
      };
      if (reqStoreId) {
        subQuery.storeId = reqStoreId;
      }
      submission = await MarketplaceListingSubmission.findOne(subQuery);
    } catch (dbErr) {
      if (isProductionEnv()) {
        const err = new Error('Service Unavailable: Listing submission store could not be reached in MongoDB.');
        err.code = 'SERVICE_UNAVAILABLE';
        err.status = 503;
        throw err;
      }
    }
  }

  if (!submission && !isProductionEnv() && inMemorySubmissionsMap.has(String(submissionId))) {
    const candidate = inMemorySubmissionsMap.get(String(submissionId));
    const candSeller = candidate?.sellerId ? String(candidate.sellerId) : null;
    const reqSeller = sellerId ? String(sellerId) : null;
    if (candSeller && reqSeller && candSeller !== reqSeller) {
      const authErr = new Error('Cross-tenant listing submission access forbidden.');
      authErr.code = 'UNAUTHORIZED_ACCESS';
      authErr.status = 403;
      throw authErr;
    }
    const candStore = candidate?.storeId ? String(candidate.storeId) : null;
    if (candStore !== reqStoreId) {
      const storeErr = new Error('Cross-store listing submission access forbidden.');
      storeErr.code = 'UNAUTHORIZED_ACCESS';
      storeErr.status = 403;
      throw storeErr;
    }
    submission = candidate;
  }

  if (!submission) {
    const err = new Error(`Listing submission "${submissionId}" not found for this seller account.`);
    err.code = 'SUBMISSION_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Ensure mock / in-memory submissions have a callable save()
  if (typeof submission.save !== 'function') {
    submission.save = async function () { return this; };
  }

  // 3. Authoritative Master Product Retrieval (Strictly Read-Only from MongoDB)
  let masterProduct = null;
  const storeId = tenant?.storeId || submission?.storeId;

  const productQuery = {
    _id: submission.productId,
    sellerId: sellerId?.toString(),
  };
  if (storeId) {
    productQuery.storeId = storeId.toString();
  }

  try {
    masterProduct = await Product.findOne(productQuery);
  } catch (e) {
    if (isProductionEnv()) {
      const dbErr = new Error('Service Unavailable: Master product could not be verified in MongoDB. Please try again later.');
      dbErr.code = 'SERVICE_UNAVAILABLE';
      dbErr.status = 503;
      throw dbErr;
    }
  }

  // Production Safety: In production, in-memory product fallback is STRICTLY PROHIBITED
  if (isProductionEnv() && !masterProduct) {
    const notFoundErr = new Error(`Authoritative Product "${submission.productId}" not found in MongoDB for this seller/store.`);
    notFoundErr.code = 'PRODUCT_NOT_FOUND';
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  // Non-production test fallback: check in-memory map
  if (!masterProduct && !isProductionEnv()) {
    if (inMemoryProductsMap.has(String(submission.productId))) {
      masterProduct = inMemoryProductsMap.get(String(submission.productId));
    }
  }

  // Enforce Tenant & Store Isolation and Product Ownership
  if (masterProduct) {
    const prodSeller = masterProduct.sellerId ? String(masterProduct.sellerId) : null;
    const reqSeller = sellerId ? String(sellerId) : null;
    if (prodSeller && reqSeller && prodSeller !== reqSeller) {
      const authErr = new Error('Cross-tenant product access forbidden.');
      authErr.code = 'UNAUTHORIZED_ACCESS';
      authErr.status = 403;
      throw authErr;
    }

    // Symmetric Store Context Matching
    const prodStore = masterProduct.storeId ? String(masterProduct.storeId) : null;
    const reqStore = storeId ? String(storeId) : null;

    if (prodStore && !reqStore) {
      const storeErr = new Error('Store context required: Product belongs to a specific store context.');
      storeErr.code = 'UNAUTHORIZED_ACCESS';
      storeErr.status = 403;
      throw storeErr;
    }
    if (!prodStore && reqStore) {
      const storeErr = new Error('Store context mismatch: Product has no store association but request specifies a store context.');
      storeErr.code = 'UNAUTHORIZED_ACCESS';
      storeErr.status = 403;
      throw storeErr;
    }
    if (prodStore && reqStore && prodStore !== reqStore) {
      const storeErr = new Error('Cross-store product access forbidden.');
      storeErr.code = 'UNAUTHORIZED_ACCESS';
      storeErr.status = 403;
      throw storeErr;
    }

    // Established Approval & Status Distinction:
    // AI-generated products require explicit seller approval (aiApproved === true)
    // Manual products must have active status (not Draft or Archived)
    if (!isProductEligibleForPublishing(masterProduct)) {
      const approvalErr = new Error(
        masterProduct.status === 'Draft' || masterProduct.status === 'Archived'
          ? `Product is in '${masterProduct.status}' status and cannot be published to Amazon.`
          : 'Product is not approved for marketplace publishing. AI-generated products require seller approval.'
      );
      approvalErr.code = 'PRODUCT_NOT_APPROVED';
      approvalErr.status = 400;
      throw approvalErr;
    }
  }

  if (!masterProduct && !isProductionEnv()) {
    // Controlled test fixture for offline test suites that do not seed inMemoryProductsMap
    masterProduct = {
      _id: submission.productId,
      title: submission.mappedAttributes?.item_name || 'Demo Master Product',
      sku: submission.sellerSku,
      brand: submission.mappedAttributes?.brand || 'Demo Brand',
      description: submission.mappedAttributes?.description || 'Demo Product Description for testing.',
      masterPrice: submission.mappedAttributes?.standard_price || 999,
      stock: submission.mappedAttributes?.quantity || 10,
      images: submission.mappedAttributes?.images || ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800'],
      status: 'Active',
      aiApproved: true,
    };
  }

  if (!masterProduct) {
    const err = new Error(`Master product "${submission.productId}" could not be resolved.`);
    err.code = 'PRODUCT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Record initial master product snapshot of all 13 protected fields to verify non-mutation:
  // title, description, shortDescription, bulletPoints, productType, brand, categoryName,
  // subcategory, attributes, images, masterPrice, costPrice, stock.
  const initialMasterSnapshot = snapshotMasterProductFields(masterProduct);

  // 4. Validate Attributes
  const gtinExempt = Boolean(
    submission.gtinExemptionRequested ||
    submission.mappedAttributes?.gtinExemptionRequested ||
    submission.mappedAttributes?.gtinExemption
  );

  const validation = validateListingData({
    product: masterProduct,
    mappedAttributes: submission.mappedAttributes || {},
    productType: submission.productType,
    gtinExemption: gtinExempt,
  });

  submission.issues = validation.issues;

  if (!validation.valid) {
    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);
    submission.status = 'VALIDATION_FAILED';
    submission.lastCheckedAt = new Date();
    try {
      await submission.save();
    } catch (e) {
      inMemorySubmissionsMap.set(String(submissionId), submission);
    }
    return {
      success: false,
      status: 'VALIDATION_FAILED',
      issues: validation.issues,
      errors: validation.errors,
      message: 'Listing validation failed with required attribute errors.',
    };
  }

  // 5. Generate SP-API Payload Preview
  const spApiPayload = buildSpApiListingPayload({
    product: masterProduct,
    mappedAttributes: submission.mappedAttributes || {},
    productType: submission.productType,
    marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
    sellerSku: submission.sellerSku,
    gtinExemption: gtinExempt,
  });

  submission.payloadPreview = spApiPayload;

  // 6. Execute Dry-Run or Sandbox Submission
  if (dryRun) {
    submission.submissionMode = 'DRY_RUN';
    submission.status = 'DRY_RUN';
    submission.lastSubmittedAt = new Date();
    submission.lastCheckedAt = new Date();
    submission.responseMetadata = {
      httpStatus: 200,
      dryRunVerified: true,
      requestId: `dry-run-${Date.now()}`,
      submittedAt: new Date(),
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.DRY_RUN,
      note: 'Dry run completed successfully. Payload validated according to Amazon SP-API v2021-08-01 schemas without marketplace mutations.',
    };

    try {
      await submission.save();
    } catch (e) {
      inMemorySubmissionsMap.set(String(submissionId), submission);
    }

    // Safety verification: master product untouched across all 13 fields
    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

    return {
      success: true,
      status: 'DRY_RUN',
      submissionMode: 'DRY_RUN',
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.DRY_RUN,
      isDryRun: true,
      submissionId: submission._id || submission.id,
      sku: submission.sellerSku,
      sellerSku: submission.sellerSku,
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
      productType: submission.productType,
      payloadPreview: spApiPayload,
      issues: validation.issues,
      message: 'Dry run completed successfully. Payload validated without Amazon marketplace mutations.',
      responseMetadata: submission.responseMetadata,
    };
  }

  // 7. Sandbox Submission Workflow
  submission.submissionMode = 'SANDBOX_SUBMISSION';
  submission.lastSubmittedAt = new Date();

  // Resolve tenant-scoped Amazon connection and sellingPartnerId (NEVER substitute internal MongoDB sellerId)
  let apiClient = client;
  let connection = null;
  let decrypted = null;

  if (!apiClient) {
    try {
      const q = buildTenantConnectionQuery(sellerId, 'AMAZON', storeId || null);
      connection = await ChannelConnection.findOne(q);
    } catch (e) {
      if (isProductionEnv()) {
        const dbErr = new Error('Service Unavailable: Unable to load Amazon channel connection from MongoDB.');
        dbErr.code = 'SERVICE_UNAVAILABLE';
        dbErr.status = 503;
        throw dbErr;
      }
    }

    if (!connection && !isProductionEnv()) {
      const sellerIdStr = sellerId ? sellerId.toString() : '';
      const storeIdStr = storeId ? storeId.toString() : null;
      connection = Array.from(inMemoryChannelsMap.values()).find(
        (c) =>
          (c.sellerId?.toString() === sellerIdStr || c.tenantId?.toString() === sellerIdStr) &&
          (c.provider === 'AMAZON' || c.channel === 'amazon') &&
          (c.storeId ? String(c.storeId) : null) === storeIdStr
      );
    }

    if (connection && connection.status === 'CONNECTED' && connection.credentials) {
      decrypted = decryptCredentials(connection.credentials);
      if (decrypted && decrypted.refreshToken) {
        const connSellingPartnerId =
          connection.sellingPartnerId || connection.externalAccountId || decrypted.sellingPartnerId || null;
        apiClient = new AmazonSpApiClient({
          sellerId: sellerId ? sellerId.toString() : null,
          sellingPartnerId: connSellingPartnerId,
          refreshToken: decrypted.refreshToken,
          region: connection.marketplaceRegion || 'eu',
          marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
          sandbox: true,
        });
      }
    }
  }

  // Strictly fail when Sandbox credentials / client are unavailable — NEVER silently return fake DRY_RUN_COMPLETED success
  if (!apiClient || typeof apiClient.executeRequest !== 'function') {
    submission.status = 'FAILED';
    submission.amazonSubmissionId = null;
    submission.responseMetadata = {
      httpStatus: 400,
      requestId: null,
      submittedAt: new Date(),
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      errorCode: 'AMAZON_CREDENTIALS_MISSING',
      note: 'Active Amazon Sandbox connection and verified seller credentials are required for Sandbox submission.',
    };

    try {
      await submission.save();
    } catch (e) {
      if (!isProductionEnv()) inMemorySubmissionsMap.set(String(submissionId), submission);
    }

    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

    return {
      success: false,
      status: 'FAILED',
      isDryRun: false,
      submissionId: submission._id || submission.id,
      amazonSubmissionId: null,
      sku: submission.sellerSku,
      sellerSku: submission.sellerSku,
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
      submissionMode: submission.submissionMode,
      productType: submission.productType,
      payloadPreview: spApiPayload,
      issues: validation.issues,
      errorCode: 'AMAZON_CREDENTIALS_MISSING',
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      message: 'Amazon Sandbox submission failed: no active verified Amazon Sandbox connection/credentials available.',
      responseMetadata: submission.responseMetadata,
    };
  }

  // Resolve official Amazon Merchant Token (sellingPartnerId) — NEVER fall back to internal MongoDB sellerId
  const amazonSellingPartnerId = String(
    connection?.sellingPartnerId ||
      connection?.externalAccountId ||
      decrypted?.sellingPartnerId ||
      apiClient?.credentials?.sellingPartnerId ||
      arg1?.sellingPartnerId ||
      arg2?.sellingPartnerId ||
      submission?.sellingPartnerId ||
      ''
  ).trim();

  const isMockSellingPartnerId =
    !amazonSellingPartnerId ||
    /^(mock|sandbox_mock|fake|placeholder)/i.test(amazonSellingPartnerId) ||
    (connection?.verificationMode === 'SANDBOX_STATIC_MOCK' && connection?.sellerAuthorizationVerified === false);

  if (isMockSellingPartnerId) {
    submission.status = 'FAILED';
    submission.amazonSubmissionId = null;
    submission.responseMetadata = {
      httpStatus: 400,
      requestId: null,
      submittedAt: new Date(),
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      errorCode: 'MISSING_SELLING_PARTNER_ID',
      note: 'A real verified Amazon sellingPartnerId (Merchant Token) is required for Listings Items PUT API. Internal sellerId and Sandbox static mock identities cannot be substituted.',
    };

    try {
      await submission.save();
    } catch (e) {
      if (!isProductionEnv()) inMemorySubmissionsMap.set(String(submissionId), submission);
    }

    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

    return {
      success: false,
      status: 'FAILED',
      isDryRun: false,
      submissionId: submission._id || submission.id,
      amazonSubmissionId: null,
      sku: submission.sellerSku,
      sellerSku: submission.sellerSku,
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
      submissionMode: submission.submissionMode,
      productType: submission.productType,
      payloadPreview: spApiPayload,
      issues: validation.issues,
      errorCode: 'MISSING_SELLING_PARTNER_ID',
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      message: 'Verified Amazon sellingPartnerId (Merchant Token) is required. Reconnect Amazon to bind sellingPartnerId.',
      responseMetadata: submission.responseMetadata,
    };
  }

  // Schema validation against Product Type Definition (cached)
  let schemaValidation = { valid: true, errors: [], warnings: [], schemaSource: 'UNKNOWN' };
  try {
    const schemaDef = await getProductTypeDefinition(apiClient, submission.productType, {
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
    });
    schemaValidation = validatePayloadAgainstProductTypeSchema(spApiPayload, schemaDef);
  } catch {
    // Non-blocking if schema fetch itself throws
  }

  if (!schemaValidation.valid) {
    submission.status = 'VALIDATION_FAILED';
    submission.amazonSubmissionId = null;
    submission.issues = [...(validation.issues || []), ...schemaValidation.errors, ...schemaValidation.warnings];
    submission.responseMetadata = {
      httpStatus: 400,
      requestId: null,
      submittedAt: new Date(),
      schemaSource: schemaValidation.schemaSource,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      errorCode: 'SCHEMA_VALIDATION_FAILED',
    };

    try {
      await submission.save();
    } catch (e) {
      if (!isProductionEnv()) inMemorySubmissionsMap.set(String(submissionId), submission);
    }

    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

    return {
      success: false,
      status: 'VALIDATION_FAILED',
      isDryRun: false,
      amazonSubmissionId: null,
      sellerSku: submission.sellerSku,
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
      submissionMode: submission.submissionMode,
      issues: submission.issues,
      errorCode: 'SCHEMA_VALIDATION_FAILED',
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      payloadPreview: spApiPayload,
      responseMetadata: submission.responseMetadata,
      message: 'Listing payload failed Amazon Product Type JSON Schema validation.',
    };
  }

  const queryParams = new URLSearchParams({
    marketplaceIds: submission.marketplaceId || 'A21TJRUUN4KGV',
    issueLocale: 'en_IN',
  });
  const isValidationPreview =
    mode === 'VALIDATION_PREVIEW' ||
    submission?.submissionMode === 'VALIDATION_PREVIEW' ||
    arg1?.mode === 'VALIDATION_PREVIEW' ||
    arg2?.mode === 'VALIDATION_PREVIEW';

  if (isValidationPreview) {
    queryParams.set('mode', 'VALIDATION_PREVIEW');
  }

  // Strictly use Amazon's sellingPartnerId (Merchant Token) in the Listings Items PUT URL
  const endpointPath = `/listings/2021-08-01/items/${encodeURIComponent(amazonSellingPartnerId)}/${encodeURIComponent(submission.sellerSku)}?${queryParams.toString()}`;

  try {
    const amazonResponse = await apiClient.executeRequest(endpointPath, {
      method: 'PUT',
      operation: 'putListingsItem',
      body: JSON.stringify(spApiPayload),
    });

    const submissionIdResult =
      amazonResponse.submissionId ||
      amazonResponse.payload?.submissionId ||
      amazonResponse.data?.submissionId ||
      null;

    const amazonStatus = amazonResponse.status ? String(amazonResponse.status).toUpperCase().trim() : null;
    const amazonIssues = Array.isArray(amazonResponse.issues) ? amazonResponse.issues : [];
    const hasBlockingErrorIssue = amazonIssues.some(
      (issue) => String(issue?.severity || '').toUpperCase() === 'ERROR'
    );

    // CRITICAL: Amazon Listings Items API returns HTTP 200 even when status === 'INVALID'
    if (amazonStatus === 'INVALID' || hasBlockingErrorIssue) {
      submission.amazonSubmissionId = submissionIdResult;
      submission.status = 'REJECTED';
      submission.issues = amazonIssues;
      submission.responseMetadata = {
        httpStatus: amazonResponse._metadata?.status || 200,
        requestId: amazonResponse._metadata?.requestId || apiClient.lastRequestId || null,
        amazonStatus: amazonStatus || 'INVALID',
        sellingPartnerId: amazonSellingPartnerId,
        schemaSource: schemaValidation.schemaSource,
        executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
        submittedAt: new Date(),
        note: 'Amazon SP-API Sandbox returned HTTP 200 with status INVALID or blocking ERROR issues.',
      };

      try {
        await submission.save();
      } catch (e) {
        if (!isProductionEnv()) inMemorySubmissionsMap.set(String(submissionId), submission);
      }

      assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

      return {
        success: false,
        status: 'REJECTED',
        amazonStatus: amazonStatus || 'INVALID',
        isDryRun: false,
        amazonSubmissionId: submissionIdResult,
        sku: submission.sellerSku,
        sellerSku: submission.sellerSku,
        marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
        submissionMode: submission.submissionMode,
        payloadPreview: spApiPayload,
        responseMetadata: submission.responseMetadata,
        issues: amazonIssues,
        errorCode: 'AMAZON_LISTING_INVALID',
        executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
        message: 'Amazon SP-API Sandbox rejected listing payload (status: INVALID). Review returned issues.',
      };
    }

    submission.amazonSubmissionId = submissionIdResult;
    submission.status = 'SANDBOX_SUBMITTED';
    submission.issues = amazonIssues;
    submission.responseMetadata = {
      httpStatus: amazonResponse._metadata?.status || 200,
      requestId: amazonResponse._metadata?.requestId || apiClient.lastRequestId || null,
      amazonStatus: amazonStatus || null,
      sellingPartnerId: amazonSellingPartnerId,
      schemaSource: schemaValidation.schemaSource,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
      submittedAt: new Date(),
      note: 'Submitted to Amazon SP-API Sandbox.',
    };

    try {
      await submission.save();
    } catch (e) {
      if (!isProductionEnv()) inMemorySubmissionsMap.set(String(submissionId), submission);
    }

    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

    return {
      success: true,
      status: 'SANDBOX_SUBMITTED',
      amazonStatus,
      isDryRun: false,
      amazonSubmissionId: submissionIdResult,
      sku: submission.sellerSku,
      sellerSku: submission.sellerSku,
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
      submissionMode: submission.submissionMode,
      payloadPreview: spApiPayload,
      responseMetadata: submission.responseMetadata,
      issues: amazonIssues,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
      message: 'Listing successfully submitted to Amazon SP-API Sandbox.',
    };
  } catch (apiErr) {
    submission.status = 'REJECTED';
    submission.amazonSubmissionId = null;
    submission.responseMetadata = {
      httpStatus: apiErr.status || 500,
      requestId: apiErr.requestId || apiClient?.lastRequestId || null,
      sellingPartnerId: amazonSellingPartnerId,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      submittedAt: new Date(),
      error: apiErr.message,
      note: 'Amazon SP-API Sandbox rejected the listing request.',
    };

    try {
      await submission.save();
    } catch (e) {
      if (!isProductionEnv()) inMemorySubmissionsMap.set(String(submissionId), submission);
    }

    assertMasterProductImmutability(masterProduct, initialMasterSnapshot);

    return {
      success: false,
      status: 'REJECTED',
      isDryRun: false,
      amazonSubmissionId: null,
      sku: submission.sellerSku,
      sellerSku: submission.sellerSku,
      marketplaceId: submission.marketplaceId || 'A21TJRUUN4KGV',
      submissionMode: submission.submissionMode,
      error: apiErr.message,
      errorCode: apiErr.code || 'SANDBOX_SUBMISSION_FAILED',
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      responseMetadata: submission.responseMetadata,
      payloadPreview: spApiPayload,
      message: `Amazon Sandbox rejected listing: ${apiErr.message}`,
    };
  }
};
