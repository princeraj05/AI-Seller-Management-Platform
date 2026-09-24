/**
  Base Marketplace Adapter Interface
  Every marketplace connector (Amazon, Flipkart, Myntra) must extend/implement these operations.
 */
export class BaseMarketplaceAdapter {
  constructor(credentials) {
    this.credentials = credentials;
  }

  async connect() {
    throw new Error('connect() not implemented');
  }

  async disconnect() {
    throw new Error('disconnect() not implemented');
  }

  async publishProduct(product, mapping) {
    throw new Error('publishProduct() not implemented');
  }

  async updateProduct(productId, updatePayload) {
    throw new Error('updateProduct() not implemented');
  }

  async updateInventory(sku, quantity) {
    throw new Error('updateInventory() not implemented');
  }

  async fetchOrders(filters) {
    throw new Error('fetchOrders() not implemented');
  }

  async updatePrice(sku, price) {
    throw new Error('updatePrice() not implemented');
  }

  async fetchReturns(filters) {
    throw new Error('fetchReturns() not implemented');
  }
}
