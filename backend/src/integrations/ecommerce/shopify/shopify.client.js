import { handleShopifyAuth } from './shopify.auth.js';

export class ShopifyClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.shopUrl = credentials?.shopUrl || 'my-shop.myshopify.com';
    this.baseUrl = `https://${this.shopUrl}/admin/api/2024-01`;
  }

  async testConnection() {
    const auth = await handleShopifyAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'SHOPIFY' };
    }
    return { success: true, message: `Shopify Admin API verified for ${this.shopUrl}`, provider: 'SHOPIFY' };
  }
}
