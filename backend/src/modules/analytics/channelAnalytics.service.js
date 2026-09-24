import { getSalesAnalyticsService } from './salesAnalytics.service.js';

export const getChannelAnalyticsService = async (sellerId, query = {}) => {
  const sales = await getSalesAnalyticsService(sellerId, query);

  const channelMap = new Map();

  sales.orders.forEach((ord) => {
    const channel = (ord.channel || 'POS').toUpperCase();
    const current = channelMap.get(channel) || { orders: 0, revenue: 0, units: 0 };
    current.orders += 1;
    current.revenue += ord.totalAmount || 0;
    current.units += (ord.items || []).reduce((acc, i) => acc + (i.quantity || 1), 0);
    channelMap.set(channel, current);
  });

  const channelBreakdown = Array.from(channelMap.entries()).map(([channel, data]) => ({
    channel,
    ...data,
  }));

  return {
    totalChannelsWithSales: channelBreakdown.length,
    channels: channelBreakdown,
  };
};
