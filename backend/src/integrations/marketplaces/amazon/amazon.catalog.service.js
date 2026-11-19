import { extractCatalogSummary } from './amazon.product.mapper.js';

/**
 * Search Amazon Catalog Items using SP-API Catalog Items API v2022-04-01
 * Read-only operation.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client Authenticated Amazon API Client
 * @param {Object} options
 * @param {string} [options.keywords] Search terms
 * @param {string|string[]} [options.identifiers] UPC, EAN, ISBN, or ASIN list
 * @param {string} [options.identifiersType] 'ASIN', 'EAN', 'GTIN', 'ISBN', 'JAN', 'MINSAN', 'SKU', 'UPC'
 * @param {string|string[]} [options.marketplaceIds] Target marketplaces (default: India A21TJRUUN4KGV)
 * @param {string[]} [options.includedData] Attribute sections to include
 * @param {number} [options.pageSize=10] Results per page (1-20)
 * @param {string} [options.pageToken] Next page cursor
 * @returns {Promise<{ items: Array, pagination: Object, numberOfResults: number }>}
 */
export const searchCatalogItems = async (client, options = {}) => {
  const marketplaceId =
    (Array.isArray(options.marketplaceIds) ? options.marketplaceIds[0] : options.marketplaceIds) ||
    client.credentials?.marketplaceId ||
    'A21TJRUUN4KGV';

  const queryParams = new URLSearchParams();
  queryParams.set('marketplaceIds', marketplaceId);

  if (options.keywords && options.keywords.trim()) {
    queryParams.set('keywords', options.keywords.trim());
  }

  if (options.identifiers) {
    const identifiersArr = Array.isArray(options.identifiers)
      ? options.identifiers
      : String(options.identifiers).split(',').map((id) => id.trim()).filter(Boolean);
    if (identifiersArr.length > 0) {
      queryParams.set('identifiers', identifiersArr.join(','));
      if (options.identifiersType) {
        queryParams.set('identifiersType', options.identifiersType.toUpperCase());
      }
    }
  }

  const defaultIncludedData = [
    'summaries',
    'attributes',
    'images',
    'productTypes',
    'salesRanks',
    'dimensions',
    'identifiers',
  ];
  const includedData = Array.isArray(options.includedData) && options.includedData.length > 0
    ? options.includedData.join(',')
    : defaultIncludedData.join(',');
  queryParams.set('includedData', includedData);

  const pageSize = Math.min(Math.max(Number(options.pageSize) || 10, 1), 20);
  queryParams.set('pageSize', String(pageSize));

  if (options.pageToken) {
    queryParams.set('pageToken', options.pageToken);
  }

  const endpointPath = `/catalog/2022-04-01/items?${queryParams.toString()}`;
  const responseData = await client.executeRequest(endpointPath);

  const rawItems = Array.isArray(responseData.items) ? responseData.items : [];
  const normalizedItems = rawItems.map((item) => extractCatalogSummary(item, marketplaceId));

  return {
    items: normalizedItems,
    pagination: responseData.pagination || { nextToken: null, previousToken: null },
    numberOfResults: responseData.numberOfResults !== undefined ? responseData.numberOfResults : normalizedItems.length,
    marketplaceId,
  };
};

/**
 * Get details for a single Amazon Catalog Item by ASIN (v2022-04-01)
 * Read-only operation.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client Authenticated Amazon API Client
 * @param {string} asin Amazon Standard Identification Number (10 alphanumeric chars)
 * @param {Object} [options]
 * @param {string} [options.marketplaceId='A21TJRUUN4KGV'] Target marketplace
 * @param {string[]} [options.includedData]
 * @returns {Promise<Object>} Normalized catalog item
 */
export const getCatalogItem = async (client, asin, options = {}) => {
  if (!asin || !asin.trim()) {
    const err = new Error('ASIN is required to fetch Amazon catalog item.');
    err.code = 'INVALID_ASIN';
    throw err;
  }

  const cleanAsin = asin.trim().toUpperCase();
  const marketplaceId = options.marketplaceId || client.credentials?.marketplaceId || 'A21TJRUUN4KGV';

  const defaultIncludedData = [
    'summaries',
    'attributes',
    'images',
    'productTypes',
    'salesRanks',
    'dimensions',
    'identifiers',
    'relationships',
  ];
  const includedData = Array.isArray(options.includedData) && options.includedData.length > 0
    ? options.includedData.join(',')
    : defaultIncludedData.join(',');

  const queryParams = new URLSearchParams({
    marketplaceIds: marketplaceId,
    includedData,
  });

  const endpointPath = `/catalog/2022-04-01/items/${encodeURIComponent(cleanAsin)}?${queryParams.toString()}`;
  const rawItem = await client.executeRequest(endpointPath);

  return extractCatalogSummary(rawItem, marketplaceId);
};
