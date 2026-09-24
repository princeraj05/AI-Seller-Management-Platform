import { getProductAnalyticsService } from '../analytics/productAnalytics.service.js';

export const getProductTrendsService = async (sellerId, query = {}) => {
  const prodAnalytics = await getProductAnalyticsService(sellerId, query);

  return {
    gainingProducts: prodAnalytics.topProducts.map((p) => ({
      sku: p.sku,
      title: p.title,
      revenue: p.revenue,
      trend: 'UPWARD',
      evidence: `Generated ₹${p.revenue} across ${p.units} units sold`,
    })),
    inventoryRisk: prodAnalytics.lowStockProducts.map((p) => ({
      sku: p.sku,
      title: p.title,
      stock: p.stock,
      riskLevel: p.stock === 0 ? 'HIGH' : 'MEDIUM',
      evidence: `Current stock level: ${p.stock}`,
    })),
  };
};
