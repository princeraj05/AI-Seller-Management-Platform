import { mapProductToWixPayload } from './wix.mapper.js';

export const publishWixProduct = async (client, product) => {
  const payload = mapProductToWixPayload(product);
  return {
    success: true,
    externalProductId: `wix-prod-${Date.now()}`,
    status: 'PUBLISHED',
    payload,
  };
};

export const fetchWixProducts = async (client, params = {}) => {
  return { products: [], total: 0 };
};
