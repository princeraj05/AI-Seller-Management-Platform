import { ProviderNotSupportedError } from '../core/integration.errors.js';

export class BaseChannelAdapter {
  constructor(provider, connection = null) {
    this.provider = provider;
    this.connection = connection;
  }

  async connect(credentials) {
    throw new ProviderNotSupportedError('connect', this.provider);
  }

  async disconnect() {
    return { success: true, message: `Disconnected from ${this.provider}` };
  }

  async testConnection() {
    return { success: true, message: `Connection test passed for ${this.provider}`, provider: this.provider };
  }

  async fetchProducts(params = {}) {
    return { products: [], total: 0 };
  }

  async publishProduct(product, mapping = {}) {
    throw new ProviderNotSupportedError('publishProduct', this.provider);
  }

  async updateProduct(externalProductId, product) {
    throw new ProviderNotSupportedError('updateProduct', this.provider);
  }

  async fetchInventory(params = {}) {
    return { inventory: [] };
  }

  async updateInventory(sku, quantity) {
    return { success: true, sku, quantity, provider: this.provider };
  }

  async fetchOrders(params = {}) {
    return { orders: [], total: 0 };
  }

  async fetchOrder(externalOrderId) {
    throw new ProviderNotSupportedError('fetchOrder', this.provider);
  }

  async registerWebhooks(webhookUrl) {
    return { success: true, registered: true, provider: this.provider };
  }

  async handleWebhook(headers, payload) {
    return { processed: true, provider: this.provider };
  }

  normalizeProduct(rawProduct) {
    return {
      title: rawProduct.title || rawProduct.name || 'Channel Product',
      sku: rawProduct.sku || '',
      price: rawProduct.price || 0,
      stock: rawProduct.stock || 0,
    };
  }

  normalizeOrder(rawOrder) {
    return {
      channel: this.provider,
      externalOrderId: rawOrder.id || rawOrder.externalOrderId || '',
      totalAmount: rawOrder.totalAmount || rawOrder.total_price || 0,
      customer: rawOrder.customer || {},
      items: rawOrder.items || [],
      placedAt: rawOrder.placedAt || new Date(),
    };
  }

  getStatus() {
    return {
      provider: this.provider,
      connected: !!(this.connection && this.connection.status === 'CONNECTED'),
      lastSyncAt: this.connection ? this.connection.lastSyncAt : null,
    };
  }
}
