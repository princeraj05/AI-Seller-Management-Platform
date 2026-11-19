/**
 * Amazon SP-API Product & Listing Mappers
 * Maps raw Amazon SP-API responses into sanitized, standardized platform data structures
 */

/**
 * Extract clean, human-readable summary from an Amazon Catalog Item (v2022-04-01)
 *
 * @param {Object} item Raw Catalog Item response from SP-API
 * @param {string} [marketplaceId='A21TJRUUN4KGV']
 * @returns {Object} Normalized catalog item
 */
export const extractCatalogSummary = (item, marketplaceId = 'A21TJRUUN4KGV') => {
  if (!item) return null;

  const asin = item.asin || '';
  const summaries = Array.isArray(item.summaries) ? item.summaries : [];
  // Match summary for requested marketplace, or fallback to first
  const summary = summaries.find((s) => s.marketplaceId === marketplaceId) || summaries[0] || {};

  const imagesContainer = Array.isArray(item.images) ? item.images : [];
  const marketplaceImages = imagesContainer.find((i) => i.marketplaceId === marketplaceId) || imagesContainer[0] || {};
  const imagesList = Array.isArray(marketplaceImages.images) ? marketplaceImages.images : [];

  const mainImage = imagesList.find((img) => img.variant === 'MAIN')?.link || imagesList[0]?.link || '';
  const allImages = imagesList.map((img) => img.link).filter(Boolean);

  // Extract identifiers (EAN, UPC, ISBN, GTIN)
  const identifiersContainer = Array.isArray(item.identifiers) ? item.identifiers : [];
  const mIdentifiers = identifiersContainer.find((i) => i.marketplaceId === marketplaceId) || identifiersContainer[0] || {};
  const identifiersList = Array.isArray(mIdentifiers.identifiers) ? mIdentifiers.identifiers : [];

  const identifiersMap = {};
  identifiersList.forEach((id) => {
    if (id.identifierType && id.identifier) {
      identifiersMap[id.identifierType.toUpperCase()] = id.identifier;
    }
  });

  // Extract sales ranks
  const salesRanksContainer = Array.isArray(item.salesRanks) ? item.salesRanks : [];
  const mRanks = salesRanksContainer.find((r) => r.marketplaceId === marketplaceId) || salesRanksContainer[0] || {};
  const ranksList = Array.isArray(mRanks.classificationRanks) ? mRanks.classificationRanks : [];

  return {
    asin,
    marketplaceId: summary.marketplaceId || marketplaceId,
    title: summary.itemName || summary.title || `Amazon Product (${asin})`,
    brand: summary.brand || 'Generic',
    manufacturer: summary.manufacturer || '',
    modelNumber: summary.modelNumber || '',
    color: summary.color || '',
    size: summary.size || '',
    productType: summary.productType || 'PRODUCT',
    websiteDisplayGroup: summary.websiteDisplayGroup || '',
    mainImageUrl: mainImage,
    images: allImages,
    identifiers: identifiersMap,
    salesRanks: ranksList.map((r) => ({ title: r.title, rank: r.rank, link: r.link })),
    attributes: item.attributes || {},
    relationships: item.relationships || [],
  };
};

/**
 * Extract clean, human-readable summary from an Amazon Listings Item (v2021-08-01)
 *
 * @param {Object} listing Raw Listings Item response from SP-API
 * @param {string} [marketplaceId='A21TJRUUN4KGV']
 * @returns {Object} Normalized listing item
 */
export const extractListingSummary = (listing, marketplaceId = 'A21TJRUUN4KGV') => {
  if (!listing) return null;

  const sku = listing.sku || '';
  const summaries = Array.isArray(listing.summaries) ? listing.summaries : [];
  const summary = summaries.find((s) => s.marketplaceId === marketplaceId) || summaries[0] || {};

  const asin = summary.asin || '';
  const itemName = summary.itemName || `Amazon Listing (${sku})`;
  const productType = summary.productType || 'PRODUCT';
  const conditionType = summary.conditionType || 'new_new';
  const rawStatus = (summary.status || []).map((s) => String(s).toUpperCase());

  // Map Amazon listing statuses (BUYABLE, DISCOVERABLE) to platform status
  let platformStatus = 'PENDING';
  if (rawStatus.includes('BUYABLE') || rawStatus.includes('DISCOVERABLE')) {
    platformStatus = 'PUBLISHED';
  } else if (rawStatus.includes('INACTIVE') || rawStatus.includes('BLOCKED')) {
    platformStatus = 'UNPUBLISHED';
  } else if (rawStatus.length > 0) {
    platformStatus = 'ACTIVE';
  }

  // Extract offers/pricing
  const offers = Array.isArray(listing.offers) ? listing.offers : [];
  const offer = offers.find((o) => o.marketplaceId === marketplaceId) || offers[0] || {};
  const price = offer.price?.amount !== undefined ? Number(offer.price.amount) : 0;
  const currency = offer.price?.currency || 'INR';

  // Extract fulfillment availability
  const fulfillments = Array.isArray(listing.fulfillmentAvailability) ? listing.fulfillmentAvailability : [];
  const fulfillment = fulfillments[0] || {};
  const quantity = fulfillment.quantity !== undefined ? Number(fulfillment.quantity) : 0;

  // Extract issues
  const rawIssues = Array.isArray(listing.issues) ? listing.issues : [];
  const issues = rawIssues.map((issue) => ({
    code: issue.code || 'UNKNOWN',
    message: issue.message || '',
    severity: issue.severity || 'INFO',
    attributeNames: issue.attributeNames || [],
  }));

  const mainImage = summary.mainImage?.link || '';

  return {
    sku,
    asin,
    marketplaceId: summary.marketplaceId || marketplaceId,
    title: itemName,
    productType,
    conditionType,
    status: platformStatus,
    amazonStatuses: rawStatus,
    price,
    currency,
    quantity,
    imageUrl: mainImage,
    issues,
    createdDate: summary.createdDate || null,
    lastUpdatedDate: summary.lastUpdatedDate || null,
    attributes: listing.attributes || {},
  };
};

/**
 * Map Listing Item to MarketplaceListing DB Document schema
 *
 * @param {Object} normalizedListing Clean listing summary
 * @param {Object} context
 * @param {string} context.sellerId Tenant / Seller ID
 * @param {string} context.channelId ChannelConnection _id
 * @param {string} [context.internalProductId=null] Linked internal Master Product _id
 * @returns {Object} Ready to upsert into MarketplaceListing
 */
export const mapListingToDbPayload = (normalizedListing, context) => {
  const { sellerId, channelId, internalProductId = null } = context;

  return {
    sellerId,
    productId: internalProductId,
    channelId,
    provider: 'AMAZON',
    marketplaceId: normalizedListing.marketplaceId || 'A21TJRUUN4KGV',
    externalProductId: normalizedListing.asin,
    asin: normalizedListing.asin,
    externalSku: normalizedListing.sku,
    title: normalizedListing.title,
    imageUrl: normalizedListing.imageUrl,
    price: normalizedListing.price,
    currency: normalizedListing.currency,
    quantity: normalizedListing.quantity,
    status: normalizedListing.status,
    issues: normalizedListing.issues,
    lastSyncedAt: new Date(),
    metadata: {
      amazonStatuses: normalizedListing.amazonStatuses,
      conditionType: normalizedListing.conditionType,
      productType: normalizedListing.productType,
      createdDate: normalizedListing.createdDate,
      lastUpdatedDate: normalizedListing.lastUpdatedDate,
    },
  };
};
