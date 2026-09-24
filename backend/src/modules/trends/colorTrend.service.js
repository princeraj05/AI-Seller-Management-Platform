import { Product } from '../products/product.model.js';
import { inMemoryProductsMap } from '../products/product.service.js';

export const getColorTrendsService = async (sellerId, query = {}) => {
  let products = [];
  try {
    products = await Product.find({ sellerId });
  } catch (err) {
    products = Array.from(inMemoryProductsMap.values()).filter(
      (p) => p.sellerId.toString() === sellerId.toString()
    );
  }

  const colorMap = new Map();
  products.forEach((p) => {
    const color = p.color || (p.attributes && p.attributes.color) || 'Black';
    const current = colorMap.get(color) || { productsCount: 0, totalStock: 0 };
    current.productsCount += 1;
    current.totalStock += p.stock || 0;
    colorMap.set(color, current);
  });

  const colorTrends = Array.from(colorMap.entries()).map(([color, data]) => ({
    color,
    ...data,
  }));

  return {
    colorTrends,
  };
};
