export const mapProductToFlipkartPayload = (product) => {
  return {
    skuId: product.sku,
    attributeValues: {
      title: product.title,
      description: product.description,
      price: product.price || product.masterPrice,
    },
  };
};

export const mapFlipkartOrderToMaster = (fkOrder) => {
  return {
    channel: 'FLIPKART',
    externalOrderId: fkOrder.orderId || fkOrder.orderItemId || `FK-${Date.now()}`,
    customer: {
      name: fkOrder.customerName || 'Flipkart Customer',
      email: fkOrder.customerEmail || '',
    },
    items: (fkOrder.orderItems || fkOrder.items || []).map((item) => ({
      sku: item.sku || item.fsn || 'FK-SKU',
      title: item.title || 'Flipkart Item',
      quantity: item.quantity || 1,
      unitPrice: item.price || 0,
      total: (item.price || 0) * (item.quantity || 1),
    })),
    totalAmount: fkOrder.totalAmount || fkOrder.orderAmount || 0,
    placedAt: fkOrder.orderDate || new Date(),
  };
};
