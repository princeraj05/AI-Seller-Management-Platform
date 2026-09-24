export class BaseBillingProvider {
  constructor(name) {
    this.name = name;
  }

  async createSubscription(sellerId, plan) {
    throw new Error(`createSubscription not implemented for ${this.name}`);
  }

  async verifyPaymentSignature(headers, payload) {
    throw new Error(`verifyPaymentSignature not implemented for ${this.name}`);
  }
}
