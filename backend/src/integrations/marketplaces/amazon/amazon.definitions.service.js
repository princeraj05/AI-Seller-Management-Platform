/**
 * Amazon Product Type Definitions API v2020-09-01 Service
 *
 * Provides product type discovery and schema retrieval for Amazon India (A21TJRUUN4KGV).
 * Strictly read-only operations.
 */

import { AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';

const DEFINITIONS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const productTypesSearchCache = new Map();
const productTypeSchemaCache = new Map();

export const clearDefinitionsCache = () => {
  productTypesSearchCache.clear();
  productTypeSchemaCache.clear();
};

const normalizeProductTypeEntry = (pt) => {
  if (!pt || typeof pt !== 'object') return null;
  const code = String(pt.name || pt.productType || '').trim().toUpperCase();
  if (!code) return null;
  return {
    ...pt,
    name: code,
    productType: code,
    displayName: pt.displayName || code,
  };
};

// Official Standard Amazon India Product Types & Schema Definitions (Development Fallback)
// Used with explicit labeling if the Amazon SP-API Sandbox has unprovisioned dynamic definitions
export const FALLBACK_PRODUCT_TYPES = [
  {
    name: 'SHIRT',
    displayName: 'Shirt (Apparel / Tops)',
    description: 'Men, women, and kids shirts, t-shirts, kurtas, and tops.',
    category: 'Clothing & Accessories',
  },
  {
    name: 'SHOES',
    displayName: 'Shoes & Footwear',
    description: 'Formal shoes, sneakers, sandals, and traditional footwear.',
    category: 'Shoes & Handbags',
  },
  {
    name: 'BAG',
    displayName: 'Bags, Backpacks & Luggage',
    description: 'Handbags, backpacks, tote bags, and travel luggage.',
    category: 'Luggage & Bags',
  },
  {
    name: 'JEWELRY',
    displayName: 'Jewelry & Accessories',
    description: 'Fashion jewelry, necklaces, rings, and handcrafted accessories.',
    category: 'Jewellery',
  },
  {
    name: 'HOME_BED_AND_BATH',
    displayName: 'Home, Bed & Living',
    description: 'Bedsheets, cushion covers, curtains, and home decor items.',
    category: 'Home & Kitchen',
  },
  {
    name: 'CONSUMER_ELECTRONICS',
    displayName: 'Electronics Accessories',
    description: 'Mobile cases, audio accessories, chargers, and cables.',
    category: 'Electronics',
  },
];

export const FALLBACK_SCHEMAS = {
  SHIRT: {
    productType: 'SHIRT',
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId: 'A21TJRUUN4KGV',
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: {
        title: 'Product Title',
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 200,
        description: 'Include Brand + Style + Material + Color + Pack/Size (e.g. Bhartiye Crafts Pure Cotton Casual Shirt White Medium).',
      },
      brand: {
        title: 'Brand Name',
        type: 'string',
        required: true,
        description: 'Brand or manufacturer name. Must match registered brand registry or GTIN exemption.',
      },
      bullet_point: {
        title: 'Bullet Points (Key Features)',
        type: 'array',
        required: true,
        minItems: 1,
        maxItems: 5,
        description: 'Up to 5 clear bullet points describing key benefits, material, care instructions, and fit.',
      },
      description: {
        title: 'Product Description',
        type: 'string',
        required: true,
        minLength: 30,
        maxLength: 2000,
        description: 'Comprehensive detailed product description highlighting craftsmanship, materials, and usage.',
      },
      standard_price: {
        title: 'Selling Price (INR)',
        type: 'number',
        required: true,
        minimum: 1,
        description: 'Listing price in Indian Rupees (₹) inclusive of applicable taxes.',
      },
      quantity: {
        title: 'Available Stock Quantity',
        type: 'integer',
        required: true,
        minimum: 0,
        description: 'Fulfillable merchant inventory available for shipment.',
      },
      main_image: {
        title: 'Main Product Image',
        type: 'string',
        format: 'uri',
        required: true,
        description: 'Primary product photo on pure white background (RGB 255, 255, 255). Min 500x500px, recommended 1000x1000px.',
      },
      fabric_type: {
        title: 'Fabric / Material',
        type: 'string',
        required: false,
        enum: ['Cotton', 'Silk', 'Linen', 'Khadi', 'Polyester', 'Rayon', 'Wool', 'Blend'],
        description: 'Primary fabric composition.',
      },
      department: {
        title: 'Department / Gender',
        type: 'string',
        required: false,
        enum: ['Men', 'Women', 'Boys', 'Girls', 'Unisex-Adult'],
        description: 'Target consumer department.',
      },
      collar_style: {
        title: 'Collar Style',
        type: 'string',
        required: false,
        enum: ['Spread', 'Button Down', 'Mandarin', 'Classic', 'Cutaway', 'Collarless'],
      },
      color: {
        title: 'Color',
        type: 'string',
        required: false,
        description: 'Primary product color.',
      },
      size: {
        title: 'Size',
        type: 'string',
        required: false,
        enum: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Free Size'],
      },
      country_of_origin: {
        title: 'Country of Origin',
        type: 'string',
        required: false,
        default: 'IN',
        description: 'Mandatory for legal compliance in Amazon India (e.g. IN for India).',
      },
      manufacturer: {
        title: 'Manufacturer / Importer Details',
        type: 'string',
        required: false,
        description: 'Full legal name and address of manufacturer or packer.',
      },
    },
  },
  SHOES: {
    productType: 'SHOES',
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId: 'A21TJRUUN4KGV',
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: { title: 'Product Title', type: 'string', required: true, minLength: 10, maxLength: 200 },
      brand: { title: 'Brand Name', type: 'string', required: true },
      bullet_point: { title: 'Bullet Points', type: 'array', required: true, minItems: 1, maxItems: 5 },
      description: { title: 'Product Description', type: 'string', required: true, minLength: 30 },
      standard_price: { title: 'Selling Price (INR)', type: 'number', required: true, minimum: 1 },
      quantity: { title: 'Available Stock Quantity', type: 'integer', required: true, minimum: 0 },
      main_image: { title: 'Main Product Image', type: 'string', format: 'uri', required: true },
      outer_material_type: { title: 'Outer Material', type: 'string', required: false, enum: ['Leather', 'Canvas', 'Synthetic', 'Suede', 'Mesh'] },
      closure_type: { title: 'Closure Type', type: 'string', required: false, enum: ['Lace-Up', 'Slip-On', 'Buckle', 'Hook & Loop', 'Zipper'] },
      color: { title: 'Color', type: 'string', required: false },
      size: { title: 'Shoe Size (UK/India)', type: 'string', required: false, enum: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12'] },
      country_of_origin: { title: 'Country of Origin', type: 'string', required: false, default: 'IN' },
      manufacturer: { title: 'Manufacturer Details', type: 'string', required: false },
    },
  },
  BAG: {
    productType: 'BAG',
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId: 'A21TJRUUN4KGV',
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: { title: 'Product Title', type: 'string', required: true, minLength: 10, maxLength: 200 },
      brand: { title: 'Brand Name', type: 'string', required: true },
      bullet_point: { title: 'Bullet Points', type: 'array', required: true, minItems: 1, maxItems: 5 },
      description: { title: 'Product Description', type: 'string', required: true, minLength: 30 },
      standard_price: { title: 'Selling Price (INR)', type: 'number', required: true, minimum: 1 },
      quantity: { title: 'Available Stock Quantity', type: 'integer', required: true, minimum: 0 },
      main_image: { title: 'Main Product Image', type: 'string', format: 'uri', required: true },
      material: { title: 'Material', type: 'string', required: false, enum: ['Leather', 'Canvas', 'Jute', 'Nylon', 'Polyester', 'Cotton'] },
      capacity_liters: { title: 'Capacity (Liters)', type: 'number', required: false },
      color: { title: 'Color', type: 'string', required: false },
      country_of_origin: { title: 'Country of Origin', type: 'string', required: false, default: 'IN' },
      manufacturer: { title: 'Manufacturer Details', type: 'string', required: false },
    },
  },
  JEWELRY: {
    productType: 'JEWELRY',
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId: 'A21TJRUUN4KGV',
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: { title: 'Product Title', type: 'string', required: true, minLength: 10, maxLength: 200 },
      brand: { title: 'Brand Name', type: 'string', required: true },
      bullet_point: { title: 'Bullet Points', type: 'array', required: true, minItems: 1, maxItems: 5 },
      description: { title: 'Product Description', type: 'string', required: true, minLength: 30 },
      standard_price: { title: 'Selling Price (INR)', type: 'number', required: true, minimum: 1 },
      quantity: { title: 'Available Stock Quantity', type: 'integer', required: true, minimum: 0 },
      main_image: { title: 'Main Product Image', type: 'string', format: 'uri', required: true },
      metal_type: { title: 'Metal Type', type: 'string', required: false, enum: ['Brass', 'Copper', 'Silver-Plated', 'Gold-Plated', 'Stainless Steel', 'Alloy'] },
      gem_type: { title: 'Gem / Stone Type', type: 'string', required: false, enum: ['None', 'Cubic Zirconia', 'Pearl', 'Kundan', 'Crystal', 'Beads'] },
      color: { title: 'Color', type: 'string', required: false },
      country_of_origin: { title: 'Country of Origin', type: 'string', required: false, default: 'IN' },
      manufacturer: { title: 'Manufacturer Details', type: 'string', required: false },
    },
  },
  HOME_BED_AND_BATH: {
    productType: 'HOME_BED_AND_BATH',
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId: 'A21TJRUUN4KGV',
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: { title: 'Product Title', type: 'string', required: true, minLength: 10, maxLength: 200 },
      brand: { title: 'Brand Name', type: 'string', required: true },
      bullet_point: { title: 'Bullet Points', type: 'array', required: true, minItems: 1, maxItems: 5 },
      description: { title: 'Product Description', type: 'string', required: true, minLength: 30 },
      standard_price: { title: 'Selling Price (INR)', type: 'number', required: true, minimum: 1 },
      quantity: { title: 'Available Stock Quantity', type: 'integer', required: true, minimum: 0 },
      main_image: { title: 'Main Product Image', type: 'string', format: 'uri', required: true },
      material: { title: 'Material', type: 'string', required: false, enum: ['100% Cotton', 'Microfiber', 'Linen', 'Silk', 'Polyester'] },
      thread_count: { title: 'Thread Count', type: 'number', required: false },
      color: { title: 'Color', type: 'string', required: false },
      country_of_origin: { title: 'Country of Origin', type: 'string', required: false, default: 'IN' },
      manufacturer: { title: 'Manufacturer Details', type: 'string', required: false },
    },
  },
  CONSUMER_ELECTRONICS: {
    productType: 'CONSUMER_ELECTRONICS',
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId: 'A21TJRUUN4KGV',
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: { title: 'Product Title', type: 'string', required: true, minLength: 10, maxLength: 200 },
      brand: { title: 'Brand Name', type: 'string', required: true },
      bullet_point: { title: 'Bullet Points', type: 'array', required: true, minItems: 1, maxItems: 5 },
      description: { title: 'Product Description', type: 'string', required: true, minLength: 30 },
      standard_price: { title: 'Selling Price (INR)', type: 'number', required: true, minimum: 1 },
      quantity: { title: 'Available Stock Quantity', type: 'integer', required: true, minimum: 0 },
      main_image: { title: 'Main Product Image', type: 'string', format: 'uri', required: true },
      compatible_devices: { title: 'Compatible Devices', type: 'string', required: false },
      connector_type: { title: 'Connector Type', type: 'string', required: false, enum: ['USB-C', 'Lightning', 'Micro-USB', 'Wireless', '3.5mm Jack'] },
      color: { title: 'Color', type: 'string', required: false },
      country_of_origin: { title: 'Country of Origin', type: 'string', required: false, default: 'IN' },
      manufacturer: { title: 'Manufacturer Details', type: 'string', required: false },
    },
  },
};

/**
 * Search Amazon Product Types using Product Type Definitions API v2020-09-01
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV']
 * @param {string} [options.keywords]
 * @returns {Promise<{ productTypes: Array, source: string, note?: string }>}
 */
export const searchProductTypes = async (client, options = {}) => {
  const marketplaceId = options.marketplaceId || client?.credentials?.marketplaceId || 'A21TJRUUN4KGV';
  const keywords = options.keywords && options.keywords.trim() ? options.keywords.trim() : '';
  const hasLiveClient = Boolean(client && typeof client.executeRequest === 'function');
  const cacheKey = `${hasLiveClient ? 'LIVE' : 'FALLBACK'}:${marketplaceId}:${keywords.toLowerCase()}`;

  if (!options.bypassCache) {
    const cached = productTypesSearchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.data, cached: true };
    }
  }

  const queryParams = new URLSearchParams({ marketplaceIds: marketplaceId });
  if (keywords) {
    queryParams.set('keywords', keywords);
  }

  const endpointPath = `/definitions/2020-09-01/productTypes?${queryParams.toString()}`;

  if (hasLiveClient) {
    try {
      const responseData = await client.executeRequest(endpointPath, {
        method: 'GET',
        operation: 'searchDefinitionsProductTypes',
      });
      if (responseData && Array.isArray(responseData.productTypes) && responseData.productTypes.length > 0) {
        const normalizedTypes = responseData.productTypes
          .map(normalizeProductTypeEntry)
          .filter(Boolean);
        const liveResult = {
          productTypes: normalizedTypes,
          source: 'AMAZON_SP_API',
          marketplaceId,
          executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
          diagnostics: responseData._metadata || (typeof client.getLastRequestDiagnostics === 'function' ? client.getLastRequestDiagnostics() : null),
          cached: false,
        };
        productTypesSearchCache.set(cacheKey, {
          data: liveResult,
          expiresAt: Date.now() + DEFINITIONS_CACHE_TTL_MS,
        });
        return liveResult;
      }
    } catch (apiErr) {
      console.warn(`[Amazon SP-API Diagnostics] Product Type Definitions search warning: ${apiErr.message}`);
    }
  }

  // Graceful development fallback with transparent labeling
  let filtered = FALLBACK_PRODUCT_TYPES;
  if (keywords) {
    const kw = keywords.toLowerCase();
    filtered = FALLBACK_PRODUCT_TYPES.filter(
      (pt) => pt.name.toLowerCase().includes(kw) || pt.displayName.toLowerCase().includes(kw) || pt.category.toLowerCase().includes(kw)
    );
  }

  const fallbackResult = {
    productTypes: filtered.map(normalizeProductTypeEntry).filter(Boolean),
    source: 'DEVELOPMENT_FALLBACK',
    marketplaceId,
    executionOutcome: AMAZON_EXECUTION_OUTCOMES.MOCK,
    cached: false,
    note: 'Showing official Amazon India product types via development fallback. Connect Amazon Sandbox or ensure dynamic definitions are provisioned.',
  };

  return fallbackResult;
};

/**
 * Get dynamic schema definition for a single product type (with 30-min TTL caching)
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} clientOrType
 * @param {string} productType e.g. 'SHIRT', 'SHOES', 'BAG'
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV']
 * @returns {Promise<Object>} JSON Schema & required attributes definition
 */
export const getProductTypeDefinition = async (clientOrType, productType, options = {}) => {
  let client = clientOrType;
  if (typeof clientOrType === 'string') {
    options = typeof productType === 'object' && productType !== null ? productType : {};
    productType = clientOrType;
    client = null;
  }

  if (!productType || !productType.trim()) {
    throw new Error('Product type is required to fetch Amazon schema definitions.');
  }

  const cleanType = productType.trim().toUpperCase();
  const marketplaceId = options.marketplaceId || client?.credentials?.marketplaceId || 'A21TJRUUN4KGV';
  const hasLiveClient = Boolean(client && typeof client.executeRequest === 'function');
  const cacheKey = `${hasLiveClient ? 'LIVE' : 'FALLBACK'}:${marketplaceId}:${cleanType}`;

  if (!options.bypassCache) {
    const cached = productTypeSchemaCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.data, cached: true };
    }
  }

  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
    requirements: 'LISTING',
    locale: 'en_IN',
  });

  const endpointPath = `/definitions/2020-09-01/productTypes/${encodeURIComponent(cleanType)}?${queryParams.toString()}`;

  if (hasLiveClient) {
    try {
      const responseData = await client.executeRequest(endpointPath, {
        method: 'GET',
        operation: 'getDefinitionsProductType',
      });
      if (responseData && (responseData.schema || responseData.properties)) {
        const liveSchema = {
          productType: cleanType,
          schemaSource: 'AMAZON_SP_API',
          marketplaceId,
          schema: responseData.schema || null,
          properties: responseData.schema?.properties || responseData.properties || {},
          requiredAttributes: Array.isArray(responseData.schema?.required)
            ? responseData.schema.required
            : Array.isArray(responseData.requiredAttributes)
            ? responseData.requiredAttributes
            : [],
          requirements: responseData.requirements || 'LISTING',
          productTypeVersion: responseData.productTypeVersion || 'LATEST',
          executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
          diagnostics: responseData._metadata || (typeof client.getLastRequestDiagnostics === 'function' ? client.getLastRequestDiagnostics() : null),
          cached: false,
        };
        productTypeSchemaCache.set(cacheKey, {
          data: liveSchema,
          expiresAt: Date.now() + DEFINITIONS_CACHE_TTL_MS,
        });
        return liveSchema;
      }
    } catch (apiErr) {
      console.warn(`[Amazon SP-API Diagnostics] Product Type schema fetch warning for ${cleanType}: ${apiErr.message}`);
    }
  }

  // Check development fallback
  const fallback = FALLBACK_SCHEMAS[cleanType] || {
    productType: cleanType,
    schemaSource: 'DEVELOPMENT_FALLBACK',
    marketplaceId,
    requirements: 'LISTING',
    requiredAttributes: ['item_name', 'brand', 'bullet_point', 'description', 'standard_price', 'quantity', 'main_image'],
    properties: {
      item_name: { title: 'Product Title', type: 'string', required: true, minLength: 10, maxLength: 200 },
      brand: { title: 'Brand Name', type: 'string', required: true },
      bullet_point: { title: 'Bullet Points', type: 'array', required: true, minItems: 1, maxItems: 5 },
      description: { title: 'Product Description', type: 'string', required: true, minLength: 30 },
      standard_price: { title: 'Selling Price (INR)', type: 'number', required: true, minimum: 1 },
      quantity: { title: 'Available Stock Quantity', type: 'integer', required: true, minimum: 0 },
      main_image: { title: 'Main Product Image', type: 'string', format: 'uri', required: true },
      country_of_origin: { title: 'Country of Origin', type: 'string', required: false, default: 'IN' },
      manufacturer: { title: 'Manufacturer Details', type: 'string', required: false },
    },
    note: `Generic fallback schema for ${cleanType}. Official Amazon Sandbox does not provide dynamic definitions for this type.`,
  };

  return {
    ...fallback,
    executionOutcome: AMAZON_EXECUTION_OUTCOMES.MOCK,
    cached: false,
  };
};

/**
 * Validate an SP-API Listings Items payload against a retrieved JSON Schema or normalized fallback schema.
 *
 * @param {Object} spApiPayload { productType, requirements, attributes }
 * @param {Object} schemaDef Output from getProductTypeDefinition()
 * @returns {{ valid: boolean, errors: Array, warnings: Array, schemaSource: string }}
 */
export const validatePayloadAgainstProductTypeSchema = (spApiPayload, schemaDef) => {
  const errors = [];
  const warnings = [];
  const schemaSource = schemaDef?.schemaSource || 'UNKNOWN';
  const attrs = spApiPayload?.attributes || {};

  if (!schemaDef || typeof schemaDef !== 'object') {
    return { valid: true, errors, warnings, schemaSource };
  }

  // Normalize JSON Schema (official SP-API) or fallback schema properties
  const jsonSchema = schemaDef.schema && typeof schemaDef.schema === 'object' ? schemaDef.schema : null;
  const props = jsonSchema?.properties || schemaDef.properties || {};
  const requiredFields = Array.isArray(jsonSchema?.required)
    ? jsonSchema.required
    : Array.isArray(schemaDef.requiredAttributes)
    ? schemaDef.requiredAttributes
    : [];

  // Map friendly fallback names to SP-API v2021-08-01 attribute keys
  const resolveAttrValue = (field) => {
    if (field === 'standard_price') {
      return attrs.purchasable_offer?.[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
    }
    if (field === 'quantity') {
      return attrs.fulfillment_availability?.[0]?.quantity;
    }
    if (field === 'main_image') {
      return attrs.main_product_image_locator?.[0]?.media_location;
    }
    if (field === 'bullet_point') {
      return Array.isArray(attrs.bullet_point) ? attrs.bullet_point.map((b) => b.value).filter(Boolean) : [];
    }
    const raw = attrs[field];
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null && 'value' in raw[0]) {
      return raw[0].value;
    }
    return raw;
  };

  // 1. Required attribute presence
  for (const field of requiredFields) {
    const val = resolveAttrValue(field);
    const isMissing =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '') ||
      (Array.isArray(val) && val.length === 0);

    if (isMissing) {
      errors.push({
        attribute: field,
        code: 'SCHEMA_REQUIRED_ATTRIBUTE_MISSING',
        severity: 'ERROR',
        message: `Schema (${schemaSource}) requires attribute "${field}" for product type ${schemaDef.productType || spApiPayload?.productType}.`,
      });
    }
  }

  // 2. Property constraint checks (type, minLength, maxLength, minimum, minItems, maxItems, enum)
  for (const [field, rules] of Object.entries(props)) {
    if (!rules || typeof rules !== 'object') continue;
    const val = resolveAttrValue(field);
    if (val === undefined || val === null || val === '') continue;

    if (typeof val === 'string') {
      if (typeof rules.minLength === 'number' && val.trim().length < rules.minLength) {
        warnings.push({
          attribute: field,
          code: 'SCHEMA_MIN_LENGTH',
          severity: 'WARNING',
          message: `Attribute "${field}" is shorter than recommended minimum length (${rules.minLength}).`,
        });
      }
      if (typeof rules.maxLength === 'number' && val.trim().length > rules.maxLength) {
        errors.push({
          attribute: field,
          code: 'SCHEMA_MAX_LENGTH',
          severity: 'ERROR',
          message: `Attribute "${field}" exceeds schema maxLength (${rules.maxLength}).`,
        });
      }
      if (Array.isArray(rules.enum) && rules.enum.length > 0) {
        const lowerEnum = rules.enum.map((e) => String(e).toLowerCase());
        if (!lowerEnum.includes(val.trim().toLowerCase())) {
          warnings.push({
            attribute: field,
            code: 'SCHEMA_ENUM_MISMATCH',
            severity: 'WARNING',
            message: `Attribute "${field}" value "${val}" is not in schema allowed enum values.`,
          });
        }
      }
    }

    if (typeof val === 'number') {
      if (typeof rules.minimum === 'number' && val < rules.minimum) {
        errors.push({
          attribute: field,
          code: 'SCHEMA_MINIMUM_VIOLATION',
          severity: 'ERROR',
          message: `Attribute "${field}" (${val}) is below schema minimum (${rules.minimum}).`,
        });
      }
      if (rules.type === 'integer' && !Number.isInteger(val)) {
        errors.push({
          attribute: field,
          code: 'SCHEMA_INTEGER_REQUIRED',
          severity: 'ERROR',
          message: `Attribute "${field}" must be an integer.`,
        });
      }
    }

    if (Array.isArray(val)) {
      if (typeof rules.maxItems === 'number' && val.length > rules.maxItems) {
        errors.push({
          attribute: field,
          code: 'SCHEMA_MAX_ITEMS',
          severity: 'ERROR',
          message: `Attribute "${field}" has ${val.length} items, exceeding schema maxItems (${rules.maxItems}).`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaSource,
  };
};
