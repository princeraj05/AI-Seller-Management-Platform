import { BaseWebsiteAdapter } from '../../base/baseWebsiteAdapter.js';
import { CustomApiClient } from './custom.client.js';
import { publishCustomProduct, fetchCustomProducts } from './custom.product.service.js';
import { updateCustomInventory, fetchCustomInventory } from './custom.inventory.service.js';
import { fetchCustomOrders, fetchCustomOrderById } from './custom.order.service.js';
import { handleCustomWebhookNotification } from './custom.webhook.service.js';
import { mapCustomOrderToMaster } from './custom.mapper.js';

export class CustomAdapter extends BaseWebsiteAdapter {
  constructor(connection = null) {
    super('CUSTOM_WEBSITE', connection);
    this.client = new CustomApiClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishCustomProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchCustomProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateCustomInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchCustomInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchCustomOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchCustomOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleCustomWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapCustomOrderToMaster(rawOrder);
  }
}
