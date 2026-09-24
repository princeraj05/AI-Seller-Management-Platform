export const validateProductInput = (data) => {
  const errors = {};
  const { title, sku, masterPrice } = data;

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.title = 'Product title is required';
  }

  if (!sku || typeof sku !== 'string' || !sku.trim()) {
    errors.sku = 'SKU is required';
  }

  if (masterPrice === undefined || masterPrice === null || typeof masterPrice !== 'number' || masterPrice < 0) {
    errors.masterPrice = 'Valid non-negative master price is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
