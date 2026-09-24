import { mapCustomOrderToMaster } from './custom.mapper.js';

export const fetchCustomOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchCustomOrderById = async (client, externalOrderId) => {
  return mapCustomOrderToMaster({
    order_id: externalOrderId,
    total_amount: 1599,
    items: [{ sku: 'CUST-ITEM-1', name: 'Custom Product', quantity: 1, price: 1599, total: 1599 }],
  });
};
