export const validateAssistantInput = (data) => {
  const errors = [];
  if (!data.question || typeof data.question !== 'string' || data.question.trim() === '') {
    errors.push('Question string is required for AI Assistant');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
};
