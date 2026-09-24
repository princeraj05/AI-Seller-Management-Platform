import { AmazonAdapter } from '../marketplaces/amazon/amazon.adapter.js';
import { FlipkartAdapter } from '../marketplaces/flipkart/flipkart.adapter.js';
import { MyntraAdapter } from '../marketplaces/myntra/myntra.adapter.js';
import { ShopifyAdapter } from '../ecommerce/shopify/shopify.adapter.js';
import { WooCommerceAdapter } from '../ecommerce/woocommerce/woocommerce.adapter.js';
import { WixAdapter } from '../ecommerce/wix/wix.adapter.js';
import { CustomAdapter } from '../ecommerce/custom/custom.adapter.js';
import { BaseChannelAdapter } from '../base/baseChannelAdapter.js';

export const getChannelAdapter = (provider, connection = null) => {
  const normProvider = (provider || '').toUpperCase().trim();

  switch (normProvider) {
    case 'AMAZON':
      return new AmazonAdapter(connection);
    case 'FLIPKART':
      return new FlipkartAdapter(connection);
    case 'MYNTRA':
      return new MyntraAdapter(connection);
    case 'SHOPIFY':
      return new ShopifyAdapter(connection);
    case 'WOOCOMMERCE':
      return new WooCommerceAdapter(connection);
    case 'WIX':
      return new WixAdapter(connection);
    case 'CUSTOM_WEBSITE':
    case 'CUSTOM':
      return new CustomAdapter(connection);
    case 'POS':
      return new BaseChannelAdapter('POS', connection);
    default:
      throw new Error(`Unsupported integration provider: ${provider}`);
  }
};
