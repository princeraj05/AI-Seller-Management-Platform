export const updateShopifyInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    status: 'UPDATED',
  };
};

export const fetchShopifyInventory = async (client, params = {}) => {
  return { inventory: [] };
};
