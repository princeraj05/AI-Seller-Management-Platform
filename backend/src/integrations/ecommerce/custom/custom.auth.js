import { validateExternalUrl } from '../../core/integration.utils.js';

export const handleCustomAuth = async (credentials) => {
  const { baseUrl, apiKey, authType = 'BEARER' } = credentials || {};
  if (!baseUrl) {
    return {
      authenticated: false,
      message: 'Custom Website API requires a valid Base URL.',
    };
  }

  // SSRF Validation
  validateExternalUrl(baseUrl);

  return {
    authenticated: true,
    baseUrl,
    authType,
  };
};
