import { mapProductToShopifyPayload } from './shopify.mapper.js';

export const publishShopifyProduct = async (client, product) => {
  const payload = mapProductToShopifyPayload(product);
  return {
    success: true,
    externalProductId: `shp-prod-${Date.now()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchShopifyProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
