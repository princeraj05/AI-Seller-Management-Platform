import { PROVIDERS } from '../../integrations/core/integration.constants.js';

export const validateConnectChannelInput = (data) => {
  const errors = [];

  if (!data.provider || !PROVIDERS[data.provider.toUpperCase()]) {
    errors.push(`Provider must be one of: ${Object.keys(PROVIDERS).join(', ')}`);
  }

  if (!data.displayName || typeof data.displayName !== 'string' || data.displayName.trim() === '') {
    errors.push('Display Name is required');
  }

  if (!data.credentials || typeof data.credentials !== 'object') {
    errors.push('Credentials object is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
