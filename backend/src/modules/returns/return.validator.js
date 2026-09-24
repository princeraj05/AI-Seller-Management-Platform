export const validateReturnInput = (data) => {
  const errors = [];

  if (!data.orderId && !data.externalOrderId) {
    errors.push('Either orderId or externalOrderId is required');
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('Items array must contain at least one item');
  } else {
    data.items.forEach((item, idx) => {
      if (!item.sku || typeof item.sku !== 'string' || item.sku.trim() === '') {
        errors.push(`Item at index ${idx} must have a valid SKU`);
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        errors.push(`Item at index ${idx} must have quantity greater than 0`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateInspectionInput = (data) => {
  const errors = [];
  const validDispositions = ['RESTOCK', 'DAMAGED', 'DISPOSED', 'PENDING_INSPECTION'];

  if (!data.disposition || !validDispositions.includes(data.disposition)) {
    errors.push(`Disposition must be one of: ${validDispositions.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
