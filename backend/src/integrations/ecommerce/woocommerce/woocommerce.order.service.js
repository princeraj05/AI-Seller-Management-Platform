import { mapWooCommerceOrderToMaster } from './woocommerce.mapper.js';

export const fetchWooCommerceOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchWooCommerceOrderById = async (client, externalOrderId) => {
  return mapWooCommerceOrderToMaster({
    id: externalOrderId,
    number: `WC-${externalOrderId}`,
    total: '2199',
    line_items: [{ sku: 'WC-ITEM-1', name: 'Woo Item', quantity: 1, price: '2199', total: '2199' }],
  });
};
