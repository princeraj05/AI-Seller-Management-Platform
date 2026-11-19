import { extractListingSummary } from './amazon.product.mapper.js';

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
    throw err;
  }
  if (!sku || !sku.trim()) {
    const err = new Error('SKU is required to fetch Amazon listing item.');
    err.code = 'INVALID_SKU';
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
  const rawListing = await client.executeRequest(endpointPath);

  return extractListingSummary(rawListing, marketplaceId);
};

/**
 * Put / Create or update an Amazon Listings Item using Listings Items API v2021-08-01
 * Supports options.mode = 'VALIDATION_PREVIEW' for preview validation without marketplace mutation.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client Authenticated Amazon API Client
 * @param {string} sellerId Amazon Merchant / Seller ID
 * @param {string} sku Seller-specific Stock Keeping Unit
 * @param {Object} payload Official Listings Items API payload { productType, requirements, attributes }
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV']
 * @param {string} [options.mode] 'VALIDATION_PREVIEW'
 * @param {string} [options.issueLocale='en_IN']
 * @returns {Promise<Object>} Amazon Listings submission response { submissionId, status, issues }
 */
export const putListingsItem = async (client, sellerId, sku, payload, options = {}) => {
  if (!sellerId || !sellerId.trim()) {
    const err = new Error('Selling Partner ID (sellerId) is required for putListingsItem.');
    err.code = 'INVALID_SELLER_ID';
    throw err;
  }
  if (!sku || !sku.trim()) {
    const err = new Error('SKU is required for putListingsItem.');
    err.code = 'INVALID_SKU';
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
    body: JSON.stringify(payload),
  });

  return responseData;
};

/**
 * Search or retrieve a seller's listings using Listings Items API v2021-08-01
 * Read-only operation. Supports pagination via pageToken.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client Authenticated Amazon API Client
 * @param {string} sellerId Amazon Merchant / Seller ID
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV']
 * @param {string[]} [options.includedData]
 * @param {string} [options.pageToken]
 * @param {number} [options.pageSize=10]
 * @returns {Promise<{ items: Array, pagination: Object }>}
 */
export const searchListingsItems = async (client, sellerId, options = {}) => {
  if (!sellerId || !sellerId.trim()) {
    const err = new Error('Selling Partner ID (sellerId) is required to search listings items.');
    err.code = 'INVALID_SELLER_ID';
    throw err;
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

  if (options.pageToken) {
    queryParams.set('pageToken', options.pageToken);
  }
  if (options.pageSize) {
    queryParams.set('pageSize', String(Math.min(Math.max(Number(options.pageSize) || 10, 1), 50)));
  }

  const endpointPath = `/listings/2021-08-01/items/${encodeURIComponent(cleanSellerId)}?${queryParams.toString()}`;

  try {
    const responseData = await client.executeRequest(endpointPath);
    const rawItems = Array.isArray(responseData.items)
      ? responseData.items
      : Array.isArray(responseData.listings)
      ? responseData.listings
      : [];

    const normalizedItems = rawItems.map((item) => extractListingSummary(item, marketplaceId));

    return {
      items: normalizedItems,
      pagination: responseData.pagination || { nextToken: responseData.nextToken || null },
      marketplaceId,
      sellerId: cleanSellerId,
    };
  } catch (error) {
    // If the endpoint path returns 404/400 because specific SKUs are needed in sandbox mode:
    if (error.status === 404 || error.status === 400) {
      return {
        items: [],
        pagination: { nextToken: null },
        marketplaceId,
        sellerId: cleanSellerId,
        note: 'No active listings returned from Amazon for this query.',
      };
    }
    throw error;
  }
};
