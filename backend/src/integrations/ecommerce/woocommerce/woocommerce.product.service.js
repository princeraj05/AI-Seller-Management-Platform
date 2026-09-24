import { mapProductToWooCommercePayload } from './woocommerce.mapper.js';

export const publishWooCommerceProduct = async (client, product) => {
  const payload = mapProductToWooCommercePayload(product);
  return {
    success: true,
    externalProductId: `wc-prod-${Date.now()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchWooCommerceProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
