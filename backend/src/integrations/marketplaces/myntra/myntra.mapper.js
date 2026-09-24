export const mapProductToMyntraPayload = (product) => {
  return {
    styleId: product.sku,
    productName: product.title,
    mrp: product.price || product.masterPrice,
  };
};

export const mapMyntraOrderToMaster = (mOrder) => {
  return {
    channel: 'MYNTRA',
    externalOrderId: mOrder.myntraOrderId || mOrder.id || `MYN-${Date.now()}`,
    customer: {
      name: mOrder.customerName || 'Myntra Customer',
      email: mOrder.customerEmail || '',
    },
    items: (mOrder.items || []).map((item) => ({
      sku: item.sku || 'MYN-SKU',
      title: item.title || 'Myntra Fashion Item',
      quantity: item.quantity || 1,
      unitPrice: item.price || 0,
      total: (item.price || 0) * (item.quantity || 1),
    })),
    totalAmount: mOrder.totalAmount || 0,
    placedAt: mOrder.orderDate || new Date(),
  };
};
