import { BaseWebsiteAdapter } from '../../base/baseWebsiteAdapter.js';
import { WixClient } from './wix.client.js';
import { publishWixProduct, fetchWixProducts } from './wix.product.service.js';
import { updateWixInventory, fetchWixInventory } from './wix.inventory.service.js';
import { fetchWixOrders, fetchWixOrderById } from './wix.order.service.js';
import { handleWixWebhookNotification } from './wix.webhook.service.js';
import { mapWixOrderToMaster } from './wix.mapper.js';

export class WixAdapter extends BaseWebsiteAdapter {
  constructor(connection = null) {
    super('WIX', connection);
    this.client = new WixClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishWixProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchWixProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateWixInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchWixInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchWixOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchWixOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleWixWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapWixOrderToMaster(rawOrder);
  }
}
