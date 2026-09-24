import { Order } from '../orders/order.model.js';
import { inMemoryOrdersMap } from '../orders/order.service.js';
import { parseDateRange } from './analytics.validator.js';

export const getSalesAnalyticsService = async (sellerId, query = {}) => {
  const { startDate, endDate, range } = parseDateRange(query);

  let orders = [];
  try {
    orders = await Order.find({
      sellerId,
      createdAt: { $gte: startDate, $lte: endDate },
    });
  } catch (err) {
    console.warn('DB fetch sales analytics failed/bypassed:', err.message);
    orders = Array.from(inMemoryOrdersMap.values()).filter(
      (o) => o.sellerId.toString() === sellerId.toString()
    );
  }

  const validOrders = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'FAILED');
  const cancelledOrders = orders.filter((o) => o.status === 'CANCELLED');

  const totalOrders = validOrders.length;
  const totalRevenue = validOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const unitsSold = validOrders.reduce((acc, o) => {
    const itemsCount = (o.items || []).reduce((iAcc, item) => iAcc + (item.quantity || 1), 0);
    return acc + itemsCount;
  }, 0);

  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return {
    range,
    startDate,
    endDate,
    totalOrders,
    totalRevenue,
    unitsSold,
    averageOrderValue,
    cancelledOrderCount: cancelledOrders.length,
    orders: validOrders,
  };
};
