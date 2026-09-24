const ALLOWED_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'ADJUSTMENT',
  'RESERVATION',
  'RELEASE',
  'SYNC',
  'INITIAL_STOCK',
  'DAMAGE',
  'LOSS',
];

export const validateStockAdjustInput = (data) => {
  const errors = {};
  const { sku, productId, delta, type } = data;

  if (!sku && !productId) {
    errors.sku = 'SKU or ProductId is required for stock adjustment';
  }

  if (delta === undefined || delta === null || typeof delta !== 'number' || delta === 0) {
    errors.delta = 'Non-zero numerical delta is required';
  }

  if (type && !ALLOWED_TYPES.includes(type)) {
    errors.type = `Invalid transaction type: ${type}`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateReservationInput = (data) => {
  const errors = {};
  const { sku, productId, quantity } = data;

  if (!sku && !productId) {
    errors.sku = 'SKU or ProductId is required for reservation';
  }

  if (!quantity || typeof quantity !== 'number' || quantity <= 0) {
    errors.quantity = 'Positive quantity is required for reservation';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
