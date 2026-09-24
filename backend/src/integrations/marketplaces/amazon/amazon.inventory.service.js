export const updateAmazonInventory = async (client, sku, quantity) => {
  return {
    success: true,
    sku,
    quantity,
    feedId: `AMZ-FEED-${Date.now()}`,
    status: 'SUBMITTED',
  };
};

export const fetchAmazonInventory = async (client, params = {}) => {
  return { inventory: [] };
};
