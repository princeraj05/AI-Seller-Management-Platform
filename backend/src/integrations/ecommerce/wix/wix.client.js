import { handleWixAuth } from './wix.auth.js';

export class WixClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = 'https://www.wixapis.com/stores/v1';
  }

  async testConnection() {
    const auth = await handleWixAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'WIX' };
    }
    return { success: true, message: `Wix Stores API verified for site ${auth.siteId}`, provider: 'WIX' };
  }
}
