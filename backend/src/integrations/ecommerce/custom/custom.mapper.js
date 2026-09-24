export const mapProductToCustomPayload = (product) => {
  return {
    product_title: product.title,
    product_sku: product.sku,
    master_price: product.price || product.masterPrice || 0,
    stock_quantity: product.stock || 0,
  };
};

export const mapCustomOrderToMaster = (cOrder) => {
  return {
    channel: 'CUSTOM_WEBSITE',
    externalOrderId: cOrder.order_id || cOrder.id || `CUST-${Date.now()}`,
    customer: {
      name: cOrder.customer_name || 'Website Customer',
      email: cOrder.customer_email || '',
    },
    items: (cOrder.items || []).map((item) => ({
      sku: item.sku || 'CUST-SKU',
      title: item.name || item.title || 'Custom Item',
      quantity: item.quantity || 1,
      unitPrice: parseFloat(item.price || 0),
      total: parseFloat(item.total || 0),
    })),
    totalAmount: parseFloat(cOrder.total_amount || cOrder.total || 0),
    placedAt: cOrder.created_at || new Date(),
  };
};
