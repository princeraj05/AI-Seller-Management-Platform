import { mapAmazonOrderToMaster } from './amazon.mapper.js';

export const fetchAmazonOrders = async (client, params = {}) => {
  return { orders: [], total: 0 };
};

export const fetchAmazonOrderById = async (client, externalOrderId) => {
  return mapAmazonOrderToMaster({
    AmazonOrderId: externalOrderId,
    OrderTotal: { Amount: 1999 },
    OrderItems: [{ SellerSKU: 'AMZ-ITEM-1', QuantityOrdered: 1, ItemPrice: { Amount: 1999 } }],
  });
};
