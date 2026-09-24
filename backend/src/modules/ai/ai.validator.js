export const validateAIGenerateInput = (data) => {
  const errors = {};
  const { prompt } = data;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    errors.prompt = 'Product prompt or details are required for AI generation';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};
