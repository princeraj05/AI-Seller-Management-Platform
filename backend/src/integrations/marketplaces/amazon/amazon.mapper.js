export const mapProductToAmazonPayload = (masterProduct) => {
  return {
    productType: 'PRODUCT',
    requirements: 'LISTING',
    attributes: {
      item_name: [{ value: masterProduct.title, language_tag: 'en_IN' }],
      brand: [{ value: masterProduct.brand || 'Generic' }],
      bullet_point: masterProduct.description ? [{ value: masterProduct.description }] : [],
      purchasable_offer: [
        {
          currency: 'INR',
          our_price: [{ schedule: [{ value_with_tax: masterProduct.price || masterProduct.masterPrice || 0 }] }],
        },
      ],
    },
    sku: masterProduct.sku,
  };
};

export const mapAmazonOrderToMaster = (amazonOrder) => {
  return {
    channel: 'AMAZON',
    externalOrderId: amazonOrder.AmazonOrderId || amazonOrder.orderId || `AMZ-${Date.now()}`,
    customer: {
      name: amazonOrder.BuyerInfo?.BuyerName || amazonOrder.buyerName || 'Amazon Customer',
      email: amazonOrder.BuyerInfo?.BuyerEmail || amazonOrder.buyerEmail || '',
    },
    items: (amazonOrder.OrderItems || amazonOrder.items || []).map((item) => ({
      sku: item.SellerSKU || item.sku || 'AMZ-SKU',
      title: item.Title || item.title || 'Amazon Item',
      quantity: item.QuantityOrdered || item.quantity || 1,
      unitPrice: item.ItemPrice?.Amount || item.unitPrice || 0,
      total: (item.ItemPrice?.Amount || item.unitPrice || 0) * (item.QuantityOrdered || item.quantity || 1),
    })),
    totalAmount: amazonOrder.OrderTotal?.Amount || amazonOrder.totalAmount || 0,
    placedAt: amazonOrder.PurchaseDate || new Date(),
  };
};
