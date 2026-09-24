import { mapProductToAmazonPayload } from './amazon.mapper.js';

export const publishAmazonProduct = async (client, product) => {
  const payload = mapProductToAmazonPayload(product);
  return {
    success: true,
    externalProductId: `ASIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchAmazonProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
