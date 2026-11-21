import { extractCatalogSummary } from './amazon.product.mapper.js';
import { AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';

export const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';

/**
 * Authoritative Static Sandbox compatibility audit from official
 * amzn/selling-partner-api-models -> models/catalog-items-api-model/catalogItems_2022-04-01.json
 *
 * Verified findings:
 * - Official model defines ONLY 2 HTTP 200 static fixtures, both hardcoded to US (ATVPDKIKX0DER).
 * - ZERO static fixtures exist for India (A21TJRUUN4KGV) or any EU-region marketplace.
 * - Sending US (ATVPDKIKX0DER) to EU Sandbox (sandbox.sellingpartnerapi-eu.amazon.com) fails
 *   with HTTP 403 Unauthorized ("The marketplaces you provided are not valid for region.").
 */
export const CATALOG_SANDBOX_COMPATIBILITY = Object.freeze({
  apiVersion: '2022-04-01',
  modelSource: 'amzn/selling-partner-api-models/models/catalog-items-api-model/catalogItems_2022-04-01.json',
  indiaMarketplaceId: INDIA_MARKETPLACE_ID,
  hasIndiaFixture: false,
  hasEuRegionFixture: false,
  documentedIncludedData: Object.freeze([
    'classifications',
    'dimensions',
    'identifiers',
    'images',
    'productTypes',
    'relationships',
    'salesRanks',
    'summaries',
    'vendorDetails',
  ]),
  documentedOfficialFixtures: Object.freeze([
    Object.freeze({
      operationId: 'searchCatalogItems',
      method: 'GET',
      path: '/catalog/2022-04-01/items',
      region: 'na',
      marketplaceIds: Object.freeze(['ATVPDKIKX0DER']),
      keywords: Object.freeze(['samsung', 'tv']),
      returnedAsin: 'B07N4M94X4',
    }),
    Object.freeze({
      operationId: 'getCatalogItem',
      method: 'GET',
      path: '/catalog/2022-04-01/items/{asin}',
      region: 'na',
      marketplaceIds: Object.freeze(['ATVPDKIKX0DER']),
      asin: 'B07N4M94X4',
      returnedAsin: 'B07N4M94X4',
    }),
  ]),
});

/**
 * Deterministically inspect whether a catalog request matches any documented
 * catalogItems_2022-04-01.json Static Sandbox fixture — read-only, never mutates target marketplace.
 */
export const checkCatalogSandboxFixtureCompatibility = ({
  operationId = 'searchCatalogItems',
  region = 'eu',
  marketplaceId = INDIA_MARKETPLACE_ID,
  keywords = '',
  asin = '',
} = {}) => {
  const normRegion = String(region || 'eu').toLowerCase().trim();
  const normMarketplace = String(marketplaceId || INDIA_MARKETPLACE_ID).trim();

  if (normRegion === 'eu' && normMarketplace === 'ATVPDKIKX0DER') {
    return {
      supportedInStaticSandbox: false,
      reason: 'MARKETPLACE_REGION_MISMATCH',
      hasIndiaFixture: false,
      hasEuRegionFixture: false,
      region: normRegion,
      marketplaceId: normMarketplace,
      message:
        'US marketplace ATVPDKIKX0DER is not valid on the EU Sandbox endpoint (Amazon returns HTTP 403 region mismatch).',
    };
  }

  if (normRegion !== 'na' || normMarketplace !== 'ATVPDKIKX0DER') {
    return {
      supportedInStaticSandbox: false,
      reason: 'NO_STATIC_FIXTURE_FOR_MARKETPLACE',
      hasIndiaFixture: false,
      hasEuRegionFixture: false,
      region: normRegion,
      marketplaceId: normMarketplace,
      message: `Official catalogItems_2022-04-01.json contains no Static Sandbox fixtures for marketplace ${normMarketplace} in region ${normRegion}.`,
    };
  }

  if (operationId === 'searchCatalogItems') {
    const serialized = serializeCatalogKeywords(keywords).toLowerCase();
    const matchesFixture = serialized === 'samsung,tv';
    return {
      supportedInStaticSandbox: matchesFixture,
      reason: matchesFixture ? 'MATCHES_DOCUMENTED_NA_FIXTURE' : 'UNMATCHED_SANDBOX_KEYWORDS',
      hasIndiaFixture: false,
      hasEuRegionFixture: false,
      region: normRegion,
      marketplaceId: normMarketplace,
      matchedFixture: matchesFixture ? CATALOG_SANDBOX_COMPATIBILITY.documentedOfficialFixtures[0] : null,
    };
  }

  if (operationId === 'getCatalogItem') {
    const cleanAsin = String(asin || '').trim().toUpperCase();
    const matchesFixture = cleanAsin === 'B07N4M94X4';
    return {
      supportedInStaticSandbox: matchesFixture,
      reason: matchesFixture ? 'MATCHES_DOCUMENTED_NA_FIXTURE' : 'UNMATCHED_SANDBOX_ASIN',
      hasIndiaFixture: false,
      hasEuRegionFixture: false,
      region: normRegion,
      marketplaceId: normMarketplace,
      matchedFixture: matchesFixture ? CATALOG_SANDBOX_COMPATIBILITY.documentedOfficialFixtures[1] : null,
    };
  }

  return {
    supportedInStaticSandbox: false,
    reason: 'UNSUPPORTED_OPERATION',
    hasIndiaFixture: false,
    hasEuRegionFixture: false,
    region: normRegion,
    marketplaceId: normMarketplace,
  };
};

/**
 * Official Amazon SP-API Catalog Items API v2022-04-01 enums
 */
export const ALLOWED_IDENTIFIER_TYPES = Object.freeze([
  'ASIN',
  'EAN',
  'GTIN',
  'ISBN',
  'JAN',
  'MINSAN',
  'SKU',
  'UPC',
]);

export const ALLOWED_INCLUDED_DATA = Object.freeze([
  'attributes',
  'classifications',
  'dimensions',
  'identifiers',
  'images',
  'productTypes',
  'relationships',
  'salesRanks',
  'summaries',
  'vendorDetails',
]);

const DEFAULT_SEARCH_INCLUDED_DATA = Object.freeze([
  'summaries',
  'images',
  'productTypes',
  'identifiers',
  'salesRanks',
]);

const DEFAULT_ITEM_INCLUDED_DATA = Object.freeze([
  'summaries',
  'attributes',
  'images',
  'productTypes',
  'salesRanks',
  'dimensions',
  'identifiers',
  'relationships',
]);

/**
 * Serialize free-text search terms into official Catalog Items v2022-04-01
 * comma-delimited keyword list (max 20 keywords, deduplicated, trimmed).
 *
 * Example: "wireless earbuds" -> "wireless,earbuds"
 */
export const serializeCatalogKeywords = (rawKeywords) => {
  if (rawKeywords === undefined || rawKeywords === null) return '';
  const source = Array.isArray(rawKeywords) ? rawKeywords.join(',') : String(rawKeywords);
  const seen = new Set();
  const tokens = [];

  for (const raw of source.split(/[\s,]+/)) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push(clean);
    }
    if (tokens.length >= 20) break;
  }

  return tokens.join(',');
};

const normalizeIncludedData = (rawIncludedData, defaults) => {
  if (!rawIncludedData) return [...defaults];
  const arr = Array.isArray(rawIncludedData)
    ? rawIncludedData
    : String(rawIncludedData).split(',');
  const valid = arr
    .map((v) => String(v || '').trim())
    .filter((v) => ALLOWED_INCLUDED_DATA.includes(v));
  return valid.length > 0 ? Array.from(new Set(valid)) : [...defaults];
};

const createValidationError = (message, code = 'INVALID_CATALOG_QUERY', status = 400) => {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
};

/**
 * Enrich Amazon Catalog SP-API errors with truthful diagnostics and explicit
 * Static Sandbox unmatched-arguments classification without fabricating data.
 */
const wrapCatalogApiError = (error, client, { marketplaceId, operation, querySummary }) => {
  const diagnostics =
    error.diagnostics ||
    (typeof client?.getLastRequestDiagnostics === 'function'
      ? client.getLastRequestDiagnostics()
      : null);
  const isSandbox = client?.isSandbox !== false;
  const amazonFirstError = Array.isArray(error.sanitizedData?.errors)
    ? error.sanitizedData.errors[0]
    : null;
  const amazonErrorCode = amazonFirstError?.code || error.code || 'API_ERROR';
  const amazonErrorMessage = amazonFirstError?.message || error.message || 'Amazon Catalog API request failed.';
  const amazonErrorDetails = amazonFirstError?.details || '';
  const region = client?.region || 'eu';

  const isStaticSandboxNoMatch =
    isSandbox &&
    error.status === 400 &&
    String(amazonErrorCode).toLowerCase() === 'invalidinput' &&
    /could not match input arguments/i.test(amazonErrorMessage);

  if (isStaticSandboxNoMatch) {
    const wrapped = new Error(
      `Amazon EU Static Sandbox has no Catalog Items v2022-04-01 static fixture for India (${marketplaceId}) or arbitrary keyword searches. ` +
        `Official catalogItems_2022-04-01.json only defines NA/US (ATVPDKIKX0DER) fixtures; Amazon returned HTTP 400 InvalidInput ("Could not match input arguments").`
    );
    wrapped.status = 400;
    wrapped.code = 'SANDBOX_CATALOG_STATIC_NO_MATCH';
    wrapped.errorCategory = 'UNSUPPORTED_SANDBOX_QUERY';
    wrapped.amazonErrorCode = amazonErrorCode;
    wrapped.amazonErrorMessage = amazonErrorMessage;
    wrapped.amazonErrorDetails = amazonErrorDetails;
    wrapped.sandboxStaticNoMatch = true;
    wrapped.marketplaceId = marketplaceId;
    wrapped.environment = 'sandbox';
    wrapped.region = region;
    wrapped.operation = operation;
    wrapped.querySummary = querySummary;
    wrapped.diagnostics = diagnostics;
    wrapped.sandboxCompatibility = {
      hasIndiaFixture: CATALOG_SANDBOX_COMPATIBILITY.hasIndiaFixture,
      hasEuRegionFixture: CATALOG_SANDBOX_COMPATIBILITY.hasEuRegionFixture,
    };
    wrapped.executionOutcome = AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE;
    return wrapped;
  }

  const isRegionMismatch =
    error.status === 403 && /not valid for region/i.test(`${amazonErrorMessage} ${amazonErrorDetails}`);

  let classifiedCode = error.code || amazonErrorCode || 'CATALOG_API_ERROR';
  let classifiedMessage = amazonErrorMessage;
  if (isRegionMismatch) {
    classifiedCode = 'MARKETPLACE_REGION_MISMATCH';
    classifiedMessage = `Marketplace ${marketplaceId} is not valid for Amazon SP-API region "${region}" (HTTP 403: ${amazonErrorDetails || amazonErrorMessage}).`;
  } else if (error.status === 401 || classifiedCode === 'UNAUTHORIZED' || classifiedCode === 'LWA_EXCHANGE_FAILED') {
    classifiedCode = 'LWA_UNAUTHORIZED';
  } else if (error.status === 403) {
    classifiedCode = 'SP_API_FORBIDDEN';
  } else if (error.status === 429) {
    classifiedCode = 'RATE_LIMITED';
  } else if (!error.status && /fetch failed|network|econn|enotfound|etimedout/i.test(amazonErrorMessage)) {
    classifiedCode = 'NETWORK_FAILURE';
  }

  const wrapped = new Error(classifiedMessage);
  wrapped.status = error.status || (classifiedCode === 'NETWORK_FAILURE' ? 502 : 500);
  wrapped.code = classifiedCode;
  wrapped.errorCategory = 'API_FAILURE';
  wrapped.amazonErrorCode = amazonErrorCode;
  wrapped.amazonErrorMessage = amazonErrorMessage;
  wrapped.amazonErrorDetails = amazonErrorDetails;
  wrapped.sandboxStaticNoMatch = false;
  wrapped.marketplaceId = marketplaceId;
  wrapped.environment = isSandbox ? 'sandbox' : 'production';
  wrapped.region = region;
  wrapped.operation = operation;
  wrapped.querySummary = querySummary;
  wrapped.diagnostics = diagnostics;
  wrapped.executionOutcome = AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE;
  return wrapped;
};

/**
 * Search Amazon Catalog Items using SP-API Catalog Items API v2022-04-01
 * Strictly read-only operation.
 *
 * Official query parameter rules enforced:
 * - marketplaceIds is required (defaults to target India marketplace A21TJRUUN4KGV)
 * - keywords and identifiers are mutually exclusive
 * - keywords serialized as comma-delimited words (max 20)
 * - identifiers requires a valid identifiersType enum value; SKU requires sellingPartnerId
 * - includedData restricted to official v2022-04-01 enum values
 * - pageSize bounded to 1..20
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client Authenticated Amazon API Client
 * @param {Object} options
 */
export const searchCatalogItems = async (client, options = {}) => {
  if (!client || typeof client.executeRequest !== 'function') {
    throw createValidationError('Authenticated Amazon SP-API client is required.', 'MISSING_SP_API_CLIENT', 400);
  }

  const marketplaceId = String(
    (Array.isArray(options.marketplaceIds) ? options.marketplaceIds[0] : options.marketplaceIds) ||
      client.credentials?.marketplaceId ||
      INDIA_MARKETPLACE_ID
  ).trim();

  const serializedKeywords = serializeCatalogKeywords(options.keywords);
  const rawIdentifiers = options.identifiers
    ? (Array.isArray(options.identifiers)
        ? options.identifiers
        : String(options.identifiers).split(',')
      )
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    : [];

  if (!serializedKeywords && rawIdentifiers.length === 0) {
    throw createValidationError(
      'Catalog search requires either keywords or identifiers.',
      'INVALID_CATALOG_QUERY',
      400
    );
  }

  if (serializedKeywords && rawIdentifiers.length > 0) {
    throw createValidationError(
      'Amazon Catalog Items API v2022-04-01 does not allow both keywords and identifiers in the same request.',
      'MUTUALLY_EXCLUSIVE_PARAMS',
      400
    );
  }

  const queryParams = new URLSearchParams();
  queryParams.set('marketplaceIds', marketplaceId);

  if (serializedKeywords) {
    queryParams.set('keywords', serializedKeywords);
  } else {
    const idType = String(options.identifiersType || '').trim().toUpperCase();
    if (!idType || !ALLOWED_IDENTIFIER_TYPES.includes(idType)) {
      throw createValidationError(
        `Valid identifiersType (${ALLOWED_IDENTIFIER_TYPES.join(', ')}) is required when searching by identifiers.`,
        'INVALID_IDENTIFIERS_TYPE',
        400
      );
    }
    queryParams.set('identifiers', rawIdentifiers.slice(0, 20).join(','));
    queryParams.set('identifiersType', idType);

    if (idType === 'SKU') {
      const spSellerId = String(
        options.sellingPartnerId || client.credentials?.sellingPartnerId || ''
      ).trim();
      if (!spSellerId) {
        throw createValidationError(
          'Amazon sellingPartnerId is required when searching catalog by identifiersType=SKU.',
          'SELLER_ID_REQUIRED_FOR_SKU',
          400
        );
      }
      queryParams.set('sellerId', spSellerId);
    }
  }

  const includedData = normalizeIncludedData(options.includedData, DEFAULT_SEARCH_INCLUDED_DATA);
  queryParams.set('includedData', includedData.join(','));

  const pageSize = Math.min(Math.max(Number(options.pageSize) || 10, 1), 20);
  queryParams.set('pageSize', String(pageSize));

  if (options.pageToken && String(options.pageToken).trim()) {
    queryParams.set('pageToken', String(options.pageToken).trim());
  }

  const endpointPath = `/catalog/2022-04-01/items?${queryParams.toString()}`;
  const querySummary = {
    marketplaceIds: marketplaceId,
    ...(serializedKeywords ? { keywords: serializedKeywords } : { identifiers: rawIdentifiers.slice(0, 20), identifiersType: queryParams.get('identifiersType') }),
    includedData,
    pageSize,
  };

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'searchCatalogItems',
    });

    const rawItems = Array.isArray(responseData?.items) ? responseData.items : [];
    const normalizedItems = rawItems
      .map((item) => extractCatalogSummary(item, marketplaceId))
      .filter(Boolean);
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : responseData?._metadata || null;

    return {
      items: normalizedItems,
      pagination: responseData?.pagination || { nextToken: null, previousToken: null },
      numberOfResults:
        responseData?.numberOfResults !== undefined
          ? responseData.numberOfResults
          : normalizedItems.length,
      marketplaceId,
      environment: client.isSandbox !== false ? 'sandbox' : 'production',
      region: client.region || 'eu',
      isEmpty: normalizedItems.length === 0,
      sandboxStaticNoMatch: false,
      querySummary,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapCatalogApiError(error, client, {
      marketplaceId,
      operation: 'searchCatalogItems',
      querySummary,
    });
  }
};

/**
 * Get details for a single Amazon Catalog Item by ASIN (v2022-04-01)
 * Strictly read-only operation.
 */
export const getCatalogItem = async (client, asin, options = {}) => {
  if (!client || typeof client.executeRequest !== 'function') {
    throw createValidationError('Authenticated Amazon SP-API client is required.', 'MISSING_SP_API_CLIENT', 400);
  }

  if (!asin || !String(asin).trim()) {
    throw createValidationError('ASIN is required to fetch Amazon catalog item.', 'INVALID_ASIN', 400);
  }

  const cleanAsin = String(asin).trim().toUpperCase();
  const marketplaceId = String(
    options.marketplaceId || client.credentials?.marketplaceId || INDIA_MARKETPLACE_ID
  ).trim();

  const includedData = normalizeIncludedData(options.includedData, DEFAULT_ITEM_INCLUDED_DATA);
  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
    includedData: includedData.join(','),
  });

  const endpointPath = `/catalog/2022-04-01/items/${encodeURIComponent(cleanAsin)}?${queryParams.toString()}`;
  const querySummary = { asin: cleanAsin, marketplaceIds: marketplaceId, includedData };

  try {
    const rawItem = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'getCatalogItem',
    });

    const normalized = extractCatalogSummary(rawItem, marketplaceId);
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : rawItem?._metadata || null;

    return {
      ...normalized,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapCatalogApiError(error, client, {
      marketplaceId,
      operation: 'getCatalogItem',
      querySummary,
    });
  }
};
