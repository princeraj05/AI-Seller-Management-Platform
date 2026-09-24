import { BaseChannelAdapter } from './baseChannelAdapter.js';

export class BaseMarketplaceAdapter extends BaseChannelAdapter {
  constructor(provider, connection = null) {
    super(provider, connection);
    this.type = 'MARKETPLACE';
  }
}
