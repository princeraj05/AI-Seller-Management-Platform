import { BaseWebsiteAdapter } from '../../base/baseWebsiteAdapter.js';
import { WooCommerceClient } from './woocommerce.client.js';
import { publishWooCommerceProduct, fetchWooCommerceProducts } from './woocommerce.product.service.js';
import { updateWooCommerceInventory, fetchWooCommerceInventory } from './woocommerce.inventory.service.js';
import { fetchWooCommerceOrders, fetchWooCommerceOrderById } from './woocommerce.order.service.js';
import { handleWooCommerceWebhookNotification } from './woocommerce.webhook.service.js';
import { mapWooCommerceOrderToMaster } from './woocommerce.mapper.js';

export class WooCommerceAdapter extends BaseWebsiteAdapter {
  constructor(connection = null) {
    super('WOOCOMMERCE', connection);
    this.client = new WooCommerceClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishWooCommerceProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchWooCommerceProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateWooCommerceInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchWooCommerceInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchWooCommerceOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchWooCommerceOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleWooCommerceWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapWooCommerceOrderToMaster(rawOrder);
  }
}
