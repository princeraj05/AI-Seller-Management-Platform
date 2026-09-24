import { getMarketTrendsService } from './marketTrend.service.js';
import { getProductTrendsService } from './productTrend.service.js';
import { getFashionTrendsService } from './fashionTrend.service.js';
import { getColorTrendsService } from './colorTrend.service.js';
import { getOpportunitiesService } from './opportunity.service.js';

export const getTrendsOverviewService = async (sellerId, query = {}) => {
  const market = await getMarketTrendsService(sellerId, query);
  const products = await getProductTrendsService(sellerId, query);
  const fashion = await getFashionTrendsService(sellerId, query);
  const colors = await getColorTrendsService(sellerId, query);
  const opportunities = await getOpportunitiesService(sellerId, query);

  return {
    source: market.source,
    marketTrends: market.risingCategories,
    gainingProducts: products.gainingProducts,
    inventoryRisk: products.inventoryRisk,
    fashionTrends: fashion.trendingStyles,
    colorTrends: colors.colorTrends,
    opportunities: opportunities.opportunities,
  };
};
