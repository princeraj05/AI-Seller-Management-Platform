/**
 * Amazon Pricing Data Mappers
 * Maps Product Pricing API offers and summaries into standardized platform schema
 */

/**
 * Map an Amazon Pricing offer response (from getItemOffers or getListingOffers)
 *
 * @param {Object} payload Raw response payload from Product Pricing API
 * @param {Object} context { sellerId, channelId, marketplaceId, sku, asin, title }
 * @returns {Object} Normalized pricing snapshot record
 */
export const mapAmazonOffersToPricing = (payload, context = {}) => {
  if (!payload) return null;

  const {
    sellerId,
    channelId,
    marketplaceId = 'A21TJRUUN4KGV',
    sku = '',
    asin: contextAsin = '',
    title = '',
  } = context;

  const asin = payload.ASIN || contextAsin || '';
  const summary = payload.Summary || {};
  const offers = Array.isArray(payload.Offers) ? payload.Offers : [];

  // 1. Identify the seller's own offer (distinct from competitor offers)
  const myOffer = offers.find((o) => o.MyOffer === true) || null;

  const ownListingPrice = myOffer?.ListingPrice?.Amount !== undefined
    ? Number(myOffer.ListingPrice.Amount)
    : null;
  const shippingPrice = myOffer?.Shipping?.Amount !== undefined
    ? Number(myOffer.Shipping.Amount)
    : 0;
  const landedPrice = ownListingPrice !== null ? ownListingPrice + shippingPrice : null;
  const isBuyBoxWinner = Boolean(myOffer?.IsBuyBoxWinner);

  // 2. Buy Box Price from summary
  const buyBoxEntry = summary.BuyBoxPrices?.[0];
  const buyBoxPrice = buyBoxEntry?.ListingPrice?.Amount !== undefined
    ? Number(buyBoxEntry.ListingPrice.Amount)
    : null;

  // 3. Lowest offer price across all sellers
  const lowestEntry = summary.LowestPrices?.[0];
  const lowestOfferPrice = lowestEntry?.ListingPrice?.Amount !== undefined
    ? Number(lowestEntry.ListingPrice.Amount)
    : null;

  // 4. Competitive price reference
  const competitiveThreshold = summary.CompetitivePriceThreshold?.Amount !== undefined
    ? Number(summary.CompetitivePriceThreshold.Amount)
    : null;

  // 5. Total offer count and currency
  const totalOfferCount = Number(summary.TotalOfferCount) || offers.length || 0;
  const currency =
    myOffer?.ListingPrice?.CurrencyCode ||
    buyBoxEntry?.ListingPrice?.CurrencyCode ||
    lowestEntry?.ListingPrice?.CurrencyCode ||
    'INR';

  return {
    sellerId,
    channelId,
    marketplaceId,
    externalSku: sku,
    asin,
    title,
    ownListingPrice,
    shippingPrice,
    landedPrice,
    buyBoxPrice,
    isBuyBoxWinner,
    lowestOfferPrice,
    competitivePrice: competitiveThreshold,
    totalOfferCount,
    currency,
    fulfillmentChannel: myOffer?.FulfillmentChannel || (buyBoxEntry?.FulfillmentChannel) || 'Amazon',
    condition: myOffer?.SubCondition || summary.ItemCondition || 'New',
    observedAt: new Date(),
    lastSyncedAt: new Date(),
    syncStatus: 'SYNCED',
    rawSummary: summary,
  };
};
