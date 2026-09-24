import { BaseMarketplaceAdapter } from '../../base/baseMarketplaceAdapter.js';
import { MyntraClient } from './myntra.client.js';
import { publishMyntraProduct, fetchMyntraProducts } from './myntra.product.service.js';
import { updateMyntraInventory, fetchMyntraInventory } from './myntra.inventory.service.js';
import { fetchMyntraOrders, fetchMyntraOrderById } from './myntra.order.service.js';
import { handleMyntraWebhookNotification } from './myntra.webhook.service.js';
import { mapMyntraOrderToMaster } from './myntra.mapper.js';

export class MyntraAdapter extends BaseMarketplaceAdapter {
  constructor(connection = null) {
    super('MYNTRA', connection);
    this.client = new MyntraClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishMyntraProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchMyntraProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateMyntraInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchMyntraInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchMyntraOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchMyntraOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleMyntraWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapMyntraOrderToMaster(rawOrder);
  }
}
