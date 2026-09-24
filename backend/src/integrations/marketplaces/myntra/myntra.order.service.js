import { mapMyntraOrderToMaster } from './myntra.mapper.js';

export const fetchMyntraOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchMyntraOrderById = async (client, externalOrderId) => {
  return mapMyntraOrderToMaster({
    myntraOrderId: externalOrderId,
    totalAmount: 2999,
    items: [{ sku: 'MYN-ITEM-1', quantity: 1, price: 2999 }],
  });
};
