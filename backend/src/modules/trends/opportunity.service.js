import { getProductAnalyticsService } from '../analytics/productAnalytics.service.js';

export const getOpportunitiesService = async (sellerId, query = {}) => {
  const prodAnalytics = await getProductAnalyticsService(sellerId, query);

  const opportunities = [];

  // 1. High Demand + Low Stock Opportunity
  prodAnalytics.lowStockProducts.forEach((p) => {
    opportunities.push({
      type: 'LOW_STOCK_RISK',
      title: `Restock Opportunity: ${p.title}`,
      description: `Product ${p.sku} has low stock (${p.stock} units remaining) relative to sales demand.`,
      evidence: `Available stock: ${p.stock}`,
      severity: p.stock === 0 ? 'HIGH' : 'MEDIUM',
      createdAt: new Date(),
    });
  });

  // 2. High Performing SKU Opportunity
  if (prodAnalytics.topProducts.length > 0) {
    const top = prodAnalytics.topProducts[0];
    opportunities.push({
      type: 'HIGH_PERFORMER_PROMOTION',
      title: `Promote Best Seller: ${top.title}`,
      description: `SKU ${top.sku} is your top revenue generator (₹${top.revenue}). Consider expanding advertising.`,
      evidence: `Revenue: ₹${top.revenue}, Units: ${top.units}`,
      severity: 'LOW',
      createdAt: new Date(),
    });
  }

  return {
    totalOpportunities: opportunities.length,
    opportunities,
  };
};
