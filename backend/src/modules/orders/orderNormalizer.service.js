/**
 * Master Order Normalizer Service
 * Transforms raw input from various channels (Amazon, Flipkart, Myntra, Website, POS) into unified Master Order structure
 */
export const normalizeOrderData = ({ channel = 'AMAZON', rawOrder = {} }) => {
  const normalizedChannel = channel.toUpperCase().trim();

  const customer = {
    customerId: rawOrder.customer?.id || rawOrder.customerId || '',
    name: rawOrder.customer?.name || rawOrder.customerName || rawOrder.customer || 'Customer',
    email: rawOrder.customer?.email || rawOrder.email || '',
    phone: rawOrder.customer?.phone || rawOrder.phone || '',
  };

  const shippingAddress = {
    name: rawOrder.shippingAddress?.name || customer.name,
    phone: rawOrder.shippingAddress?.phone || customer.phone,
    addressLine1: rawOrder.shippingAddress?.addressLine1 || rawOrder.address || 'Address Line 1',
    addressLine2: rawOrder.shippingAddress?.addressLine2 || '',
    city: rawOrder.shippingAddress?.city || 'Delhi',
    state: rawOrder.shippingAddress?.state || 'Delhi',
    postalCode: rawOrder.shippingAddress?.postalCode || '110001',
    country: rawOrder.shippingAddress?.country || 'India',
  };

  const items = (rawOrder.items || []).map((item) => ({
    productId: item.productId || item.id || null,
    variantId: item.variantId || null,
    sku: (item.sku || `SKU-${Date.now()}`).toUpperCase().trim(),
    title: item.title || item.name || 'Product Item',
    quantity: parseInt(item.quantity || item.qty || 1),
    unitPrice: parseFloat(item.unitPrice || item.price || item.masterPrice || 0),
    discount: parseFloat(item.discount || 0),
    tax: parseFloat(item.tax || 0),
    total: parseFloat(item.total || (item.unitPrice || item.price || 0) * (item.quantity || item.qty || 1)),
  }));

  const subtotal = items.reduce((acc, it) => acc + it.total, 0);
  const discount = parseFloat(rawOrder.discount || 0);
  const shippingFee = parseFloat(rawOrder.shippingFee || 0);
  const gst = Math.round(subtotal * 0.05);
  const totalAmount = parseFloat(rawOrder.totalAmount || rawOrder.amount || subtotal + gst + shippingFee - discount);

  return {
    externalOrderId: rawOrder.externalOrderId || rawOrder.orderId || rawOrder.id || '',
    channel: normalizedChannel,
    customer,
    shippingAddress,
    billingAddress: shippingAddress,
    items,
    subtotal,
    discount,
    shippingFee,
    gst,
    tax: gst,
    totalAmount,
    payment: {
      method: rawOrder.paymentMethod || rawOrder.payment?.method || 'UPI',
      status: rawOrder.paymentStatus || rawOrder.payment?.status || 'PAID',
      transactionId: rawOrder.transactionId || rawOrder.payment?.transactionId || '',
    },
    status: (rawOrder.status || 'PENDING').toUpperCase(),
    placedAt: rawOrder.placedAt || rawOrder.date || new Date(),
    sourceMetadata: rawOrder.sourceMetadata || {},
  };
};
