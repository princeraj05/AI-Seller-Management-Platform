import { BaseChannelAdapter } from './baseChannelAdapter.js';

export class BaseWebsiteAdapter extends BaseChannelAdapter {
  constructor(provider, connection = null) {
    super(provider, connection);
    this.type = 'ECOMMERCE';
  }
}
