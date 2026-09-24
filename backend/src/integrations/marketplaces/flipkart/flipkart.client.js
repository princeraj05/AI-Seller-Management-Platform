import { handleFlipkartAuth } from './flipkart.auth.js';

export class FlipkartClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = 'https://api.flipkart.net/sellers';
  }

  async testConnection() {
    const auth = await handleFlipkartAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'FLIPKART' };
    }
    return { success: true, message: 'Flipkart Seller API connection test passed', provider: 'FLIPKART' };
  }
}
