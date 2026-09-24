export const handleShopifyAuth = async (credentials) => {
  const { shopUrl, accessToken } = credentials || {};
  if (!shopUrl || !accessToken) {
    return {
      authenticated: false,
      message: 'Shopify Admin API requires Shop URL and Access Token.',
    };
  }
  return {
    authenticated: true,
    shopUrl,
    accessToken,
  };
};
