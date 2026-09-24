export const updateMyntraInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    status: 'UPDATED',
  };
};

export const fetchMyntraInventory = async (client, params = {}) => {
  return { inventory: [] };
};
