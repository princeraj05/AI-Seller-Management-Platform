import { extractListingSummary } from './amazon.product.mapper.js';
import { AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';

export const LISTINGS_PAGE_SIZE_MIN = 1;
export const LISTINGS_PAGE_SIZE_MAX = 20;
export const LISTINGS_PAGE_SIZE_DEFAULT = 10;

const wrapListingsApiError = (error, client, { marketplaceId, sellerId, operation }) => {
  const diagnostics =
    error.diagnostics ||
    (typeof client?.getLastRequestDiagnostics === 'function'
      ? client.getLastRequestDiagnostics()
      : null);
  const amazonFirstError = Array.isArray(error.sanitizedData?.errors)
    ? error.sanitizedData.errors[0]
    : null;
  const amazonErrorCode = amazonFirstError?.code || error.code || 'API_ERROR';
  const amazonErrorMessage =
    amazonFirstError?.message || error.message || 'Amazon Listings Items API request failed.';
  const amazonErrorDetails = amazonFirstError?.details || '';

  const wrapped = new Error(amazonErrorMessage);
  wrapped.status = error.status || 500;
  wrapped.code =
    error.status === 401
      ? 'LWA_UNAUTHORIZED'
      : error.status === 403
      ? 'SP_API_FORBIDDEN'
      : error.status === 429
      ? 'RATE_LIMITED'
      : error.status === 404
      ? 'LISTING_NOT_FOUND'
      : error.status === 400
      ? 'LISTINGS_BAD_REQUEST'
      : error.code || amazonErrorCode || 'LISTINGS_API_ERROR';
  wrapped.amazonErrorCode = amazonErrorCode;
  wrapped.amazonErrorMessage = amazonErrorMessage;
  wrapped.amazonErrorDetails = amazonErrorDetails;
  wrapped.marketplaceId = marketplaceId;
  wrapped.sellerId = sellerId;
  wrapped.environment = client?.isSandbox !== false ? 'sandbox' : 'production';
  wrapped.region = client?.region || 'eu';
  wrapped.operation = operation;
  wrapped.diagnostics = diagnostics;
  wrapped.executionOutcome = AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE;
  return wrapped;
};

/**
 * Get details for a single Amazon Listings Item by Seller SKU using Listings Items API v2021-08-01
 * Read-only operation. Never calls PUT, PATCH, or DELETE.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client Authenticated Amazon API Client
 * @param {string} sellerId Amazon Merchant / Seller ID
 * @param {string} sku Seller-specific Stock Keeping Unit
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV']
 * @param {string[]} [options.includedData]
 * @param {string} [options.issueLocale='en_IN']
 * @returns {Promise<Object>} Normalized listing item
 */
export const getListingsItem = async (client, sellerId, sku, options = {}) => {
  if (!sellerId || !sellerId.trim()) {
    const err = new Error('Selling Partner ID (sellerId) is required to fetch listing item.');
    err.code = 'INVALID_SELLER_ID';
    err.status = 400;
    throw err;
  }
  if (!sku || !sku.trim()) {
    const err = new Error('SKU is required to fetch Amazon listing item.');
    err.code = 'INVALID_SKU';
    err.status = 400;
    throw err;
  }

  const cleanSellerId = sellerId.trim();
  const cleanSku = sku.trim();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';

  const defaultIncludedData = ['summaries', 'attributes', 'issues', 'offers', 'fulfillmentAvailability'];
  const includedData = Array.isArray(options.includedData) && options.includedData.length > 0
    ? options.includedData.join(',')
    : defaultIncludedData.join(',');

  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
    includedData,
    issueLocale: options.issueLocale || 'en_IN',
  });

  const endpointPath = `/listings/2021-08-01/items/${encodeURIComponent(cleanSellerId)}/${encodeURIComponent(cleanSku)}?${queryParams.toString()}`;

  try {
    const rawListing = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'getListingsItem',
    });
    const normalized = extractListingSummary(rawListing, marketplaceId);
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : rawListing?._metadata || null;
    return {
      ...normalized,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapListingsApiError(error, client, {
      marketplaceId,
      sellerId: cleanSellerId,
      operation: 'getListingsItem',
    });
  }
};

/**
 * Put / Create or update an Amazon Listings Item using Listings Items API v2021-08-01
 * Supports options.mode = 'VALIDATION_PREVIEW' for preview validation without marketplace mutation.
 * Production publishing remains hard-blocked in amazon.publisher.service.js.
 */
export const putListingsItem = async (client, sellerId, sku, payload, options = {}) => {
  if (!sellerId || !sellerId.trim()) {
    const err = new Error('Selling Partner ID (sellerId) is required for putListingsItem.');
    err.code = 'INVALID_SELLER_ID';
    err.status = 400;
    throw err;
  }
  if (!sku || !sku.trim()) {
    const err = new Error('SKU is required for putListingsItem.');
    err.code = 'INVALID_SKU';
    err.status = 400;
    throw err;
  }

  const cleanSellerId = sellerId.trim();
  const cleanSku = sku.trim();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';

  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
    issueLocale: options.issueLocale || 'en_IN',
  });

  if (options.mode) {
    queryParams.set('mode', options.mode);
  }

  const endpointPath = `/listings/2021-08-01/items/${encodeURIComponent(cleanSellerId)}/${encodeURIComponent(cleanSku)}?${queryParams.toString()}`;

  const responseData = await client.executeRequest(endpointPath, {
    method: 'PUT',
    operation: 'putListingsItem',
    body: JSON.stringify(payload),
  });

  return responseData;
};

/**
 * Search or retrieve a seller's listings using official Listings Items API v2021-08-01 (searchListingsItems)
 * Strictly read-only operation.
 *
 * Official v2021-08-01 rules enforced:
 * - pageSize must be an integer between 1 and 20 (official spec maximum: 20, default: 10)
 * - Preserves pagination (nextToken / previousToken)
 * - Never silently swallows HTTP 400/404 errors; throws structured secret-safe diagnostics
 */
export const searchListingsItems = async (client, sellerId, options = {}) => {
  if (!sellerId || !sellerId.trim()) {
    const err = new Error('Selling Partner ID (sellerId) is required to search listings items.');
    err.code = 'INVALID_SELLER_ID';
    err.status = 400;
    throw err;
  }

  // Enforce official Listings Items v2021-08-01 pageSize bounds: 1..20 (reject out-of-range values)
  let validatedPageSize = null;
  if (options.pageSize !== undefined && options.pageSize !== null && options.pageSize !== '') {
    const num = Number(options.pageSize);
    if (!Number.isInteger(num) || num < LISTINGS_PAGE_SIZE_MIN || num > LISTINGS_PAGE_SIZE_MAX) {
      const err = new Error(
        `Amazon Listings Items API v2021-08-01 requires pageSize to be an integer between ${LISTINGS_PAGE_SIZE_MIN} and ${LISTINGS_PAGE_SIZE_MAX}.`
      );
      err.code = 'INVALID_PAGE_SIZE';
      err.status = 400;
      throw err;
    }
    validatedPageSize = num;
  }

  const cleanSellerId = sellerId.trim();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';

  const defaultIncludedData = ['summaries', 'attributes', 'issues', 'offers', 'fulfillmentAvailability'];
  const includedData = Array.isArray(options.includedData) && options.includedData.length > 0
    ? options.includedData.join(',')
    : defaultIncludedData.join(',');

  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
    includedData,
  });

  if (options.identifiers) {
    const idList = (Array.isArray(options.identifiers)
      ? options.identifiers
      : String(options.identifiers).split(',')
    )
      .map((i) => String(i || '').trim())
      .filter(Boolean);
    if (idList.length > 0) {
      queryParams.set('identifiers', idList.join(','));
      if (options.identifiersType) {
        queryParams.set('identifiersType', String(options.identifiersType).trim().toUpperCase());
      }
    }
  }

  if (options.pageToken && String(options.pageToken).trim()) {
    queryParams.set('pageToken', String(options.pageToken).trim());
  }
  if (validatedPageSize !== null) {
    queryParams.set('pageSize', String(validatedPageSize));
  }

  const endpointPath = `/listings/2021-08-01/items/${encodeURIComponent(cleanSellerId)}?${queryParams.toString()}`;

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'searchListingsItems',
    });
    const rawItems = Array.isArray(responseData?.items)
      ? responseData.items
      : Array.isArray(responseData?.listings)
      ? responseData.listings
      : [];

    const normalizedItems = rawItems.map((item) => extractListingSummary(item, marketplaceId));
    const nextToken = responseData?.pagination?.nextToken || responseData?.nextToken || null;
    const previousToken = responseData?.pagination?.previousToken || null;
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : responseData?._metadata || null;

    return {
      items: normalizedItems,
      pagination: { nextToken, previousToken },
      marketplaceId,
      sellerId: cleanSellerId,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    throw wrapListingsApiError(error, client, {
      marketplaceId,
      sellerId: cleanSellerId,
      operation: 'searchListingsItems',
    });
  }
};
