import { getSalesAnalyticsService } from '../analytics/salesAnalytics.service.js';

export const getMarketTrendsService = async (sellerId, query = {}) => {
  const sales = await getSalesAnalyticsService(sellerId, query);

  const categoryMap = new Map();
  sales.orders.forEach((ord) => {
    (ord.items || []).forEach((item) => {
      const cat = item.category || 'General';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + (item.quantity || 1));
    });
  });

  const risingCategories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({
      name,
      count,
      confidence: 0.88,
      evidence: `Based on ${count} units ordered in store history`,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    source: 'Derived from seller catalog and sales data',
    risingCategories,
  };
};
