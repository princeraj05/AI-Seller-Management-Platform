export const updateWooCommerceInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    status: 'UPDATED',
  };
};

export const fetchWooCommerceInventory = async (client, params = {}) => {
  return { inventory: [] };
};
