import { mapShopifyOrderToMaster } from './shopify.mapper.js';

export const fetchShopifyOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchShopifyOrderById = async (client, externalOrderId) => {
  return mapShopifyOrderToMaster({
    id: externalOrderId,
    name: `#SHP-${externalOrderId}`,
    total_price: 3499,
    line_items: [{ sku: 'SHP-ITEM-1', title: 'Shopify Item', quantity: 1, price: '3499' }],
  });
};
