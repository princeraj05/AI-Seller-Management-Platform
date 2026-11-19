/**
 * Amazon Inventory Data Mappers
 * Maps FBA and FBM inventory data from Amazon SP-API into standardized platform schema
 */

/**
 * Map an FBA Inventory Summary from getInventorySummaries (v1)
 *
 * @param {Object} item Raw FBA inventory item
 * @param {Object} context { sellerId, channelId, marketplaceId }
 * @returns {Object} Normalized marketplace inventory record
 */
export const mapFbaInventorySummary = (item, context = {}) => {
  if (!item) return null;

  const { sellerId, channelId, marketplaceId = 'A21TJRUUN4KGV' } = context;
  const details = item.inventoryDetails || {};

  const fulfillableQuantity = Number(details.fulfillableQuantity) || 0;
  const inboundWorkingQuantity = Number(details.inboundWorkingQuantity) || 0;
  const inboundShippedQuantity = Number(details.inboundShippedQuantity) || 0;
  const inboundReceivingQuantity = Number(details.inboundReceivingQuantity) || 0;
  const inboundQuantity = inboundWorkingQuantity + inboundShippedQuantity + inboundReceivingQuantity;

  const reservedQuantity = Number(details.reservedQuantity?.totalReservedQuantity) || 0;
  const unfulfillableQuantity = Number(details.unfulfillableQuantity?.totalUnfulfillableQuantity) || 0;
  const researchingQuantity = Number(details.researchingQuantity?.totalResearchingQuantity) || 0;

  // Safely use totalQuantity if returned, otherwise compute from documented component fields
  const totalQuantity =
    item.totalQuantity !== undefined
      ? Number(item.totalQuantity)
      : fulfillableQuantity + inboundQuantity + reservedQuantity + unfulfillableQuantity + researchingQuantity;

  return {
    sellerId,
    channelId,
    marketplaceId,
    externalSku: item.sellerSku || '',
    asin: item.asin || '',
    fnSku: item.fnSku || '',
    productName: item.productName || '',
    condition: item.condition || 'NewItem',
    fulfillmentChannel: 'FBA',
    fulfillableQuantity,
    inboundWorkingQuantity,
    inboundShippedQuantity,
    inboundReceivingQuantity,
    inboundQuantity,
    reservedQuantity,
    unfulfillableQuantity,
    researchingQuantity,
    sellerFulfilledQuantity: 0,
    totalQuantity,
    source: 'AMAZON_FBA_API',
    syncStatus: 'SYNCED',
    lastSyncedAt: new Date(),
    lastUpdatedTime: item.lastUpdatedTime ? new Date(item.lastUpdatedTime) : null,
    rawDetails: details,
  };
};

/**
 * Map merchant-fulfilled (FBM) stock from Listings Items API fulfillmentAvailability
 *
 * @param {Object} listing Normalized or raw listing item
 * @param {Object} context { sellerId, channelId, marketplaceId }
 * @returns {Object} Normalized marketplace inventory record
 */
export const mapFbmInventoryItem = (listing, context = {}) => {
  if (!listing) return null;

  const { sellerId, channelId, marketplaceId = 'A21TJRUUN4KGV' } = context;
  const quantity = Number(listing.quantity) || 0;

  return {
    sellerId,
    channelId,
    marketplaceId,
    externalSku: listing.sku || listing.externalSku || '',
    asin: listing.asin || listing.externalProductId || '',
    productName: listing.title || '',
    condition: listing.conditionType || 'new_new',
    fulfillmentChannel: 'FBM',
    fulfillableQuantity: 0,
    inboundQuantity: 0,
    reservedQuantity: 0,
    unfulfillableQuantity: 0,
    researchingQuantity: 0,
    sellerFulfilledQuantity: quantity,
    totalQuantity: quantity,
    source: 'AMAZON_LISTINGS_API',
    syncStatus: 'SYNCED',
    lastSyncedAt: new Date(),
    lastUpdatedTime: new Date(),
    rawDetails: { fulfillmentAvailability: listing.fulfillmentAvailability || [] },
  };
};
