export const mapProductToWixPayload = (product) => {
  return {
    product: {
      name: product.title,
      description: product.description || '',
      priceData: {
        currency: 'INR',
        price: product.price || product.masterPrice || 0,
      },
      sku: product.sku,
    },
  };
};

export const mapWixOrderToMaster = (wixOrder) => {
  return {
    channel: 'WIX',
    externalOrderId: wixOrder.number || wixOrder.id ? `${wixOrder.id}` : `WIX-${Date.now()}`,
    customer: {
      name: wixOrder.buyerInfo?.name || 'Wix Customer',
      email: wixOrder.buyerInfo?.email || '',
    },
    items: (wixOrder.lineItems || []).map((item) => ({
      sku: item.sku || 'WIX-SKU',
      title: item.name || 'Wix Item',
      quantity: item.quantity || 1,
      unitPrice: parseFloat(item.price || 0),
      total: parseFloat(item.totalPrice || 0),
    })),
    totalAmount: parseFloat(wixOrder.totals?.total || 0),
    placedAt: wixOrder.createdDate || new Date(),
  };
};
