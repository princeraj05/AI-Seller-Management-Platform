export const validateCategoryInput = (data) => {
  const errors = {};
  const { name } = data;

  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.name = 'Category name is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
