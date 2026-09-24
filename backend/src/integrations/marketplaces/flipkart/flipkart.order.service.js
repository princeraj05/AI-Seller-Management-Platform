import { mapFlipkartOrderToMaster } from './flipkart.mapper.js';

export const fetchFlipkartOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchFlipkartOrderById = async (client, externalOrderId) => {
  return mapFlipkartOrderToMaster({
    orderId: externalOrderId,
    totalAmount: 1499,
    items: [{ sku: 'FK-ITEM-1', quantity: 1, price: 1499 }],
  });
};
