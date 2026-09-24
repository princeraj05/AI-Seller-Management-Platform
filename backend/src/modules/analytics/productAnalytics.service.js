import { Product } from '../products/product.model.js';
import { inMemoryProductsMap } from '../products/product.service.js';
import { getSalesAnalyticsService } from './salesAnalytics.service.js';

export const getProductAnalyticsService = async (sellerId, query = {}) => {
  const sales = await getSalesAnalyticsService(sellerId, query);

  let products = [];
  try {
    products = await Product.find({ sellerId });
  } catch (err) {
    products = Array.from(inMemoryProductsMap.values()).filter(
      (p) => p.sellerId.toString() === sellerId.toString()
    );
  }

  // Count product sales frequency from valid orders
  const skuSalesMap = new Map();
  sales.orders.forEach((ord) => {
    (ord.items || []).forEach((item) => {
      const sku = item.sku;
      const current = skuSalesMap.get(sku) || { units: 0, revenue: 0, title: item.title };
      current.units += item.quantity || 1;
      current.revenue += item.total || 0;
      skuSalesMap.set(sku, current);
    });
  });

  const topProducts = Array.from(skuSalesMap.entries())
    .map(([sku, data]) => ({ sku, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const lowStock = products.filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= 10);
  const outOfStock = products.filter((p) => (p.stock || 0) === 0);

  return {
    totalActiveProducts: products.length,
    topProducts,
    lowStockCount: lowStock.length,
    lowStockProducts: lowStock.map((p) => ({ id: p._id, sku: p.sku, title: p.title, stock: p.stock })),
    outOfStockCount: outOfStock.length,
    outOfStockProducts: outOfStock.map((p) => ({ id: p._id, sku: p.sku, title: p.title, stock: 0 })),
  };
};
