export const updateFlipkartInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    status: 'UPDATED',
  };
};

export const fetchFlipkartInventory = async (client, params = {}) => {
  return { inventory: [] };
};
