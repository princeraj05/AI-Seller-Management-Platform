import { handleCustomAuth } from './custom.auth.js';
import { validateExternalUrl } from '../../core/integration.utils.js';

export class CustomApiClient {
  constructor(credentials) {
    this.credentials = credentials;
    this.baseUrl = credentials?.baseUrl || 'https://mycustomstore.com/api';
    if (this.baseUrl) {
      validateExternalUrl(this.baseUrl);
    }
  }

  async testConnection() {
    const auth = await handleCustomAuth(this.credentials);
    if (!auth.authenticated) {
      return { success: false, message: auth.message, provider: 'CUSTOM_WEBSITE' };
    }
    return { success: true, message: `Custom Website API verified for ${this.baseUrl}`, provider: 'CUSTOM_WEBSITE' };
  }
}
