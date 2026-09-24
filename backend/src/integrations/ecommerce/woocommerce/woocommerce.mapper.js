export const mapProductToWooCommercePayload = (product) => {
  return {
    name: product.title,
    type: 'simple',
    regular_price: String(product.price || product.masterPrice || 0),
    description: product.description || '',
    sku: product.sku,
    stock_quantity: product.stock || 0,
    manage_stock: true,
  };
};

export const mapWooCommerceOrderToMaster = (wcOrder) => {
  return {
    channel: 'WOOCOMMERCE',
    externalOrderId: wcOrder.number || wcOrder.id ? `${wcOrder.id}` : `WC-${Date.now()}`,
    customer: {
      name: wcOrder.billing
        ? `${wcOrder.billing.first_name || ''} ${wcOrder.billing.last_name || ''}`.trim()
        : 'WooCommerce Customer',
      email: wcOrder.billing?.email || '',
    },
    items: (wcOrder.line_items || []).map((item) => ({
      sku: item.sku || 'WC-SKU',
      title: item.name || 'WooCommerce Item',
      quantity: item.quantity || 1,
      unitPrice: parseFloat(item.price || 0),
      total: parseFloat(item.total || 0),
    })),
    totalAmount: parseFloat(wcOrder.total || 0),
    placedAt: wcOrder.date_created || new Date(),
  };
};
