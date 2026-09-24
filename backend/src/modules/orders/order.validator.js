export const validateOrderInput = (data) => {
  const errors = {};
  const { items, customer } = data;

  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.items = 'Order must contain at least one item';
  } else {
    items.forEach((item, idx) => {
      if (!item.sku && !item.productId) {
        errors[`items_${idx}`] = `Order item at index ${idx} is missing SKU or ProductId`;
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors[`items_${idx}_qty`] = `Order item at index ${idx} requires positive quantity`;
      }
    });
  }

  if (customer && typeof customer !== 'object') {
    errors.customer = 'Customer must be a valid object';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateOrderStatusInput = (data) => {
  const errors = {};
  const { status } = data;

  if (!status || typeof status !== 'string' || !status.trim()) {
    errors.status = 'New order status is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
