export const validateVariantInput = (data) => {
  const errors = {};
  const { sku, price } = data;

  if (!sku || typeof sku !== 'string' || !sku.trim()) {
    errors.sku = 'Variant SKU is required';
  }

  if (price === undefined || price === null || typeof price !== 'number' || price < 0) {
    errors.price = 'Valid non-negative variant price is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
