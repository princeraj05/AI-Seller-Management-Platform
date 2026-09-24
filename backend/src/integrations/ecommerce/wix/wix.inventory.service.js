export const updateWixInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    status: 'UPDATED',
  };
};

export const fetchWixInventory = async (client, params = {}) => {
  return { inventory: [] };
};
