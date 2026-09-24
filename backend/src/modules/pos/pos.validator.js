export const validatePOSCheckoutInput = (data) => {
  const errors = {};
  const { items, paymentMode } = data;

  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.items = 'Cart must contain at least one item';
  } else {
    items.forEach((item, idx) => {
      if (!item.sku && !item.productId && !item.id) {
        errors[`items_${idx}`] = `Item at index ${idx} is missing SKU or ProductId`;
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors[`items_${idx}_qty`] = `Item at index ${idx} requires a positive quantity`;
      }
    });
  }

  if (paymentMode && !['CASH', 'UPI', 'CARD', 'SPLIT', 'Cash', 'UPI', 'Card', 'Split'].includes(paymentMode)) {
    errors.paymentMode = `Invalid payment mode: ${paymentMode}`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
