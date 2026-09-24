import { mapWixOrderToMaster } from './wix.mapper.js';

export const fetchWixOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchWixOrderById = async (client, externalOrderId) => {
  return mapWixOrderToMaster({
    id: externalOrderId,
    number: `WIX-${externalOrderId}`,
    totals: { total: 1899 },
    lineItems: [{ sku: 'WIX-ITEM-1', name: 'Wix Item', quantity: 1, price: 1899, totalPrice: 1899 }],
  });
};
