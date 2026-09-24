import { handleMyntraAuth } from './myntra.auth.js';

export class MyntraClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = 'https://mmip.myntra.com/api/v1';
  }

  async testConnection() {
    const auth = await handleMyntraAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'MYNTRA' };
    }
    return { success: true, message: 'Myntra MMIP connection test verified', provider: 'MYNTRA' };
  }
}
