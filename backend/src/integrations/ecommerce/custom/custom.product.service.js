import { mapProductToCustomPayload } from './custom.mapper.js';

export const publishCustomProduct = async (client, product) => {
  const payload = mapProductToCustomPayload(product);
  return {
    success: true,
    externalProductId: `cust-prod-${Date.now()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchCustomProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
