export const mapProductToShopifyPayload = (product) => {
  return {
    product: {
      title: product.title,
      body_html: product.description || '',
      vendor: product.brand || 'Store Vendor',
      product_type: product.categoryName || 'General',
      variants: [
        {
          sku: product.sku,
          price: product.price || product.masterPrice || 0,
          inventory_quantity: product.stock || 0,
        },
      ],
    },
  };
};

export const mapShopifyOrderToMaster = (spOrder) => {
  return {
    channel: 'SHOPIFY',
    externalOrderId: spOrder.name || spOrder.id ? `${spOrder.id}` : `SHP-${Date.now()}`,
    customer: {
      name: spOrder.customer
        ? `${spOrder.customer.first_name || ''} ${spOrder.customer.last_name || ''}`.trim()
        : 'Shopify Customer',
      email: spOrder.email || spOrder.customer?.email || '',
    },
    items: (spOrder.line_items || []).map((item) => ({
      sku: item.sku || 'SHP-SKU',
      title: item.title || item.name || 'Shopify Product',
      quantity: item.quantity || 1,
      unitPrice: parseFloat(item.price || 0),
      total: parseFloat(item.price || 0) * (item.quantity || 1),
    })),
    totalAmount: parseFloat(spOrder.total_price || spOrder.totalAmount || 0),
    placedAt: spOrder.created_at || new Date(),
  };
};
