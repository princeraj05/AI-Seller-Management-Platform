import { mapProductToMyntraPayload } from './myntra.mapper.js';

export const publishMyntraProduct = async (client, product) => {
  const payload = mapProductToMyntraPayload(product);
  return {
    success: true,
    externalProductId: `MYN-STYLE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchMyntraProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
