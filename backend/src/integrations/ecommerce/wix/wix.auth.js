export const handleWixAuth = async (credentials) => {
  const { siteId, apiKey, refreshSecret } = credentials || {};
  if (!siteId || (!apiKey && !refreshSecret)) {
    return {
      authenticated: false,
      message: 'Wix Stores API requires Site ID and API Key / OAuth Refresh Secret.',
    };
  }
  return {
    authenticated: true,
    siteId,
    accessToken: `mock-wix-token-${Date.now()}`,
  };
};
