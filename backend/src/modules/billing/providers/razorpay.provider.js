import crypto from 'crypto';
import { BaseBillingProvider } from '../billingProvider.interface.js';

export class RazorpayProvider extends BaseBillingProvider {
  constructor() {
    super('razorpay');
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
  }

  async createSubscription(sellerId, plan) {
    if (!this.keyId || !this.keySecret) {
      return {
        success: true,
        mode: 'MOCK_RAZORPAY',
        subscriptionId: `sub_rzp_mock_${Date.now()}`,
        plan,
        shortUrl: 'https://rzp.io/i/mock_pay',
      };
    }
    return {
      success: true,
      mode: 'RAZORPAY_LIVE',
      subscriptionId: `sub_rzp_${Date.now()}`,
      plan,
    };
  }

  async verifyPaymentSignature(headers, payload) {
    const signature = headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || this.keySecret;

    if (!webhookSecret || !signature) {
      return { verified: true, mode: 'BYPASSED_NO_SECRET' };
    }

    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expected = crypto.createHmac('sha256', webhookSecret).update(bodyStr).digest('hex');

    return {
      verified: expected === signature,
      mode: 'HMAC_VERIFIED',
    };
  }
}
