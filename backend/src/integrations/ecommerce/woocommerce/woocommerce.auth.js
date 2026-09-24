export const handleWooCommerceAuth = async (credentials) => {
  const { storeUrl, consumerKey, consumerSecret } = credentials || {};
  if (!storeUrl || !consumerKey || !consumerSecret) {
    return {
      authenticated: false,
      message: 'WooCommerce REST API requires Store URL, Consumer Key, and Consumer Secret.',
    };
  }
  return {
    authenticated: true,
    storeUrl,
    consumerKey,
  };
};
