import { handleAmazonAuth } from './amazon.auth.js';

export class AmazonSpApiClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = credentials?.sandbox ? 'https://sandbox.sellingpartnerapi-na.amazon.com' : 'https://sellingpartnerapi-na.amazon.com';
  }

  async testConnection() {
    const auth = await handleAmazonAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'AMAZON' };
    }
    return { success: true, message: 'Amazon SP-API Connection verified successfully', provider: 'AMAZON' };
  }
}
