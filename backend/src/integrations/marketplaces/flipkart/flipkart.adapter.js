import { BaseMarketplaceAdapter } from '../../base/baseMarketplaceAdapter.js';
import { FlipkartClient } from './flipkart.client.js';
import { publishFlipkartProduct, fetchFlipkartProducts } from './flipkart.product.service.js';
import { updateFlipkartInventory, fetchFlipkartInventory } from './flipkart.inventory.service.js';
import { fetchFlipkartOrders, fetchFlipkartOrderById } from './flipkart.order.service.js';
import { handleFlipkartWebhookNotification } from './flipkart.webhook.service.js';
import { mapFlipkartOrderToMaster } from './flipkart.mapper.js';

export class FlipkartAdapter extends BaseMarketplaceAdapter {
  constructor(connection = null) {
    super('FLIPKART', connection);
    this.client = new FlipkartClient(connection?.credentials);
  }

  async testConnection() {
    return await this.client.testConnection();
  }

  async publishProduct(product) {
    return await publishFlipkartProduct(this.client, product);
  }

  async fetchProducts(params) {
    return await fetchFlipkartProducts(this.client, params);
  }

  async updateInventory(sku, quantity) {
    return await updateFlipkartInventory(this.client, sku, quantity);
  }

  async fetchInventory(params) {
    return await fetchFlipkartInventory(this.client, params);
  }

  async fetchOrders(params) {
    return await fetchFlipkartOrders(this.client, params);
  }

  async fetchOrder(externalOrderId) {
    return await fetchFlipkartOrderById(this.client, externalOrderId);
  }

  async handleWebhook(headers, payload) {
    return await handleFlipkartWebhookNotification(headers, payload);
  }

  normalizeOrder(rawOrder) {
    return mapFlipkartOrderToMaster(rawOrder);
  }
}
