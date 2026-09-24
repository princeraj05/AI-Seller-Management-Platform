import { getRevenueAnalyticsService } from './revenueAnalytics.service.js';
import { Product } from '../products/product.model.js';
import { inMemoryProductsMap } from '../products/product.service.js';

export const getProfitAnalyticsService = async (sellerId, query = {}) => {
  const rev = await getRevenueAnalyticsService(sellerId, query);

  let products = [];
  try {
    products = await Product.find({ sellerId });
  } catch (err) {
    products = Array.from(inMemoryProductsMap.values()).filter(
      (p) => p.sellerId.toString() === sellerId.toString()
    );
  }

  const hasCostData = products.some((p) => p.costPrice !== undefined && p.costPrice > 0);

  if (!hasCostData) {
    return {
      status: 'INCOMPLETE_DATA',
      message: 'Profit calculation unavailable — product cost price data is missing.',
      profit: null,
      grossRevenue: rev.grossRevenue,
      netRevenue: rev.netRevenue,
    };
  }

  const estimatedCost = products.reduce((acc, p) => acc + (p.costPrice || 0) * (p.stock || 0), 0);
  const profit = Math.max(0, rev.netRevenue - estimatedCost);

  return {
    status: 'COMPLETE',
    grossRevenue: rev.grossRevenue,
    netRevenue: rev.netRevenue,
    productCost: estimatedCost,
    profit,
  };
};
