import { BaseMarketplaceAdapter } from '../../base/baseMarketplaceAdapter.js';
import { AmazonSpApiClient } from './amazon.client.js';
import { publishAmazonProduct, fetchAmazonProducts } from './amazon.product.service.js';
import { updateAmazonInventory, fetchAmazonInventory } from './amazon.inventory.service.js';
import { fetchAmazonOrders, fetchAmazonOrderById } from './amazon.order.service.js';
import { handleAmazonWebhookNotification } from './amazon.webhook.service.js';
import { mapProductToAmazonPayload, mapAmazonOrderToMaster } from './amazon.mapper.js';

export class AmazonAdapter extends BaseMarketplaceAdapter {
  constructor(connection = null) {
    super('AMAZON', connection);
    this.client = new AmazonSpApiClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishAmazonProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchAmazonProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateAmazonInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchAmazonInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchAmazonOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchAmazonOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleAmazonWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapAmazonOrderToMaster(rawOrder);
  }
}
