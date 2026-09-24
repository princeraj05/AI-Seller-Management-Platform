import { getSalesAnalyticsService } from './salesAnalytics.service.js';
import { getRevenueAnalyticsService } from './revenueAnalytics.service.js';
import { getProfitAnalyticsService } from './profitAnalytics.service.js';
import { getProductAnalyticsService } from './productAnalytics.service.js';
import { getChannelAnalyticsService } from './channelAnalytics.service.js';

export const getAnalyticsOverviewService = async (sellerId, query = {}) => {
  const sales = await getSalesAnalyticsService(sellerId, query);
  const revenue = await getRevenueAnalyticsService(sellerId, query);
  const profit = await getProfitAnalyticsService(sellerId, query);
  const products = await getProductAnalyticsService(sellerId, query);
  const channels = await getChannelAnalyticsService(sellerId, query);

  return {
    overview: {
      totalSales: sales.totalRevenue,
      totalOrders: sales.totalOrders,
      totalRevenue: revenue.netRevenue,
      grossRevenue: revenue.grossRevenue,
      profitStatus: profit.status,
      totalProfit: profit.profit,
      averageOrderValue: sales.averageOrderValue,
      unitsSold: sales.unitsSold,
      cancelledOrders: sales.cancelledOrderCount,
      activeProducts: products.totalActiveProducts,
      lowStockProducts: products.lowStockCount,
      outOfStockProducts: products.outOfStockCount,
    },
    topProducts: products.topProducts,
    channelBreakdown: channels.channels,
  };
};
