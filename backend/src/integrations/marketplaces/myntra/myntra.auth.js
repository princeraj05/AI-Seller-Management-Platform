export const handleMyntraAuth = async (credentials) => {
  const { vendorId, apiKey } = credentials || {};
  if (!vendorId || !apiKey) {
    return {
      authenticated: false,
      message: 'Myntra MMIP requires Vendor ID and API Key (Partner approval required).',
      requiresAppApproval: true,
    };
  }
  return {
    authenticated: true,
    token: `mock-myntra-token-${Date.now()}`,
  };
};
