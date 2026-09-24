import { BaseWebsiteAdapter } from '../../base/baseWebsiteAdapter.js';
import { ShopifyClient } from './shopify.client.js';
import { publishShopifyProduct, fetchShopifyProducts } from './shopify.product.service.js';
import { updateShopifyInventory, fetchShopifyInventory } from './shopify.inventory.service.js';
import { fetchShopifyOrders, fetchShopifyOrderById } from './shopify.order.service.js';
import { handleShopifyWebhookNotification } from './shopify.webhook.service.js';
import { mapShopifyOrderToMaster } from './shopify.mapper.js';

export class ShopifyAdapter extends BaseWebsiteAdapter {
  constructor(connection = null) {
    super('SHOPIFY', connection);
    this.client = new ShopifyClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishShopifyProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchShopifyProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateShopifyInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchShopifyInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchShopifyOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchShopifyOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleShopifyWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapShopifyOrderToMaster(rawOrder);
  }
}
