import { getSalesAnalyticsService } from './salesAnalytics.service.js';
import { Return } from '../returns/return.model.js';
import { inMemoryReturnsMap } from '../returns/return.service.js';

export const getRevenueAnalyticsService = async (sellerId, query = {}) => {
  const sales = await getSalesAnalyticsService(sellerId, query);

  const grossRevenue = sales.orders.reduce((acc, o) => acc + (o.subtotal || o.totalAmount || 0), 0);
  const discounts = sales.orders.reduce((acc, o) => acc + (o.discount || 0), 0);

  let returns = [];
  try {
    returns = await Return.find({ sellerId, status: 'COMPLETED' });
  } catch (err) {
    returns = Array.from(inMemoryReturnsMap.values()).filter(
      (r) => r.sellerId.toString() === sellerId.toString() && r.status === 'COMPLETED'
    );
  }

  const refunds = returns.reduce((acc, r) => acc + (r.refundAmount || 0), 0);
  const netRevenue = Math.max(0, grossRevenue - discounts - refunds);

  return {
    range: sales.range,
    startDate: sales.startDate,
    endDate: sales.endDate,
    grossRevenue,
    discounts,
    refunds,
    netRevenue,
  };
};
