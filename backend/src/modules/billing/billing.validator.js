export const validateBillingInput = (data) => {
  const errors = [];
  const validPlans = ['FREE', 'BASIC', 'PRO', 'PREMIUM'];
  if (!data.plan || !validPlans.includes(data.plan.toUpperCase())) {
    errors.push(`Plan must be one of: ${validPlans.join(', ')}`);
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
};
