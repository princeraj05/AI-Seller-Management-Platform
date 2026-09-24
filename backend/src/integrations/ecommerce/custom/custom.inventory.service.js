export const updateCustomInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    status: 'UPDATED',
  };
};

export const fetchCustomInventory = async (client, params = {}) => {
  return { inventory: [] };
};
