import { handleWooCommerceAuth } from './woocommerce.auth.js';

export class WooCommerceClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.storeUrl = credentials?.storeUrl || 'https://example-woo-store.com';
    this.baseUrl = `${this.storeUrl.replace(/\/$/, '')}/wp-json/wc/v3`;
  }

  async testConnection() {
    const auth = await handleWooCommerceAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'WOOCOMMERCE' };
    }
    return { success: true, message: `WooCommerce REST API v3 connection verified for ${this.storeUrl}`, provider: 'WOOCOMMERCE' };
  }
}
