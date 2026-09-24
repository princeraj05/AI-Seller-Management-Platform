import { mapProductToFlipkartPayload } from './flipkart.mapper.js';

export const publishFlipkartProduct = async (client, product) => {
  const payload = mapProductToFlipkartPayload(product);
  return {
    success: true,
    externalProductId: `FSN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchFlipkartProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
