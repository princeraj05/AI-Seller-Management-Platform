import mongoose from 'mongoose';
import { encryptCredentials, decryptCredentials } from './src/utils/encryption.js';
import { getChannelAdapter } from './src/integrations/core/integration.factory.js';
import { validateExternalUrl, executeWithRetry } from './src/integrations/core/integration.utils.js';
import { RateLimitError, SSRFValidationError } from './src/integrations/core/integration.errors.js';
import {
  connectChannelService,
  getChannelsService,
  getChannelByIdService,
  disconnectChannelService,
  testChannelConnectionService,
  syncChannelService,
  publishProductToChannelService,
} from './src/modules/channels/channel.service.js';
import { processWebhookService } from './src/modules/webhooks/webhook.service.js';
import { createOrderService } from './src/modules/orders/order.service.js';
import { adjustStockService, getInventoryService } from './src/modules/inventory/inventory.service.js';

mongoose.set('bufferCommands', false);

async function runPhase5Tests() {
  console.log('==================================================');
  console.log('RUNNING PHASE 5 INTEGRATION TEST SUITE');
  console.log('==================================================\n');

  const tenantA = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  const tenantB = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  try {
    // 1. Credential Encryption & Non-Exposure Verification
    console.log('1. Testing AES-256-GCM Credential Encryption & Non-Exposure...');
    const rawCreds = { apiKey: 'secret-api-key-12345', accessToken: 'shp_token_xyz999' };
    const encrypted = encryptCredentials(rawCreds);
    if (!encrypted.iv || !encrypted.content || !encrypted.tag) {
      throw new Error('Encryption output format invalid!');
    }
    const decrypted = decryptCredentials(encrypted);
    if (decrypted.apiKey !== rawCreds.apiKey || decrypted.accessToken !== rawCreds.accessToken) {
      throw new Error('Credential Decryption failed!');
    }
    console.log('   ✓ Credential Encryption & Decryption Verified');

    // 2. Integration Factory & Adapter Resolution (7 Providers)
    console.log('\n2. Testing Integration Factory Adapter Resolution for All 7 Providers...');
    const providers = ['AMAZON', 'FLIPKART', 'MYNTRA', 'SHOPIFY', 'WOOCOMMERCE', 'WIX', 'CUSTOM_WEBSITE'];
    for (const p of providers) {
      const adapter = getChannelAdapter(p, { credentials: { apiKey: 'dummy' } });
      const status = adapter.getStatus();
      if (status.provider !== (p === 'CUSTOM_WEBSITE' ? 'CUSTOM_WEBSITE' : p)) {
        throw new Error(`Factory resolution failed for provider: ${p}`);
      }
    }
    console.log('   ✓ All 7 Provider Adapters Resolved Successfully');

    // 3. Channel Connection & Tenant Isolation
    console.log('\n3. Testing Channel Connection Creation & Sanitization...');
    const connA = await connectChannelService(tenantA, {
      provider: 'SHOPIFY',
      displayName: 'My Shopify Store',
      credentials: { shopUrl: 'store.myshopify.com', accessToken: 'shp_token_123' },
    });

    if (connA.credentials) {
      throw new Error('SECURITY VIOLATION! Encrypted credentials exposed in channel API response!');
    }
    console.log('   ✓ Channel Connected & Credentials Sanitized (Id:', connA._id, ')');

    console.log('\n4. Testing Multi-Tenant Channel Isolation...');
    const sellerBChannels = await getChannelsService(tenantB.sellerId);
    if (sellerBChannels.some((c) => c._id === connA._id || c.sellerId === tenantA.sellerId)) {
      throw new Error('SECURITY VIOLATION! Seller B accessed Seller A channel connection!');
    }
    console.log('   ✓ Multi-Tenant Isolation Verified');

    // 4. Test Connection & Sync Engine
    console.log('\n5. Testing Connection Test & Sync Engine...');
    const testRes = await testChannelConnectionService(tenantA.sellerId, connA._id);
    if (!testRes.testResult.success) {
      throw new Error('Shopify connection test failed');
    }
    console.log('   ✓ Connection Test Passed');

    const syncRes = await syncChannelService(tenantA, connA._id, 'FULL');
    if (syncRes.syncHistory.status !== 'SUCCESS') {
      throw new Error('Sync Engine failed');
    }
    console.log('   ✓ Channel Sync Executed Successfully');

    // 5. SSRF Protection Validation
    console.log('\n6. Testing SSRF Protection for Custom Website Integrations...');
    const restrictedUrls = [
      'http://localhost:8080/api',
      'http://127.0.0.1/internal',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/admin',
      'http://192.168.1.1/router',
    ];

    for (const badUrl of restrictedUrls) {
      let blocked = false;
      try {
        validateExternalUrl(badUrl);
      } catch (ssrfErr) {
        if (ssrfErr instanceof SSRFValidationError) {
          blocked = true;
        }
      }
      if (!blocked) {
        throw new Error(`SECURITY FAILURE! SSRF Protection failed to block malicious URL: ${badUrl}`);
      }
    }
    console.log('   ✓ SSRF Protection Blocked All Restricted Network Destinations');

    // 6. Webhook Idempotency & Signature Handler
    console.log('\n7. Testing Webhook Idempotency & Ingest Handler...');
    const webhookPayload = { event: 'order.created', id: 'evt-100200300', amount: 1999 };
    const wh1 = await processWebhookService('SHOPIFY', { 'x-shopify-topic': 'orders/create' }, webhookPayload);
    if (wh1.status !== 'PROCESSED') {
      throw new Error('Initial webhook ingestion failed');
    }

    const wh2 = await processWebhookService('SHOPIFY', { 'x-shopify-topic': 'orders/create' }, webhookPayload);
    if (wh2.status !== 'DUPLICATE_IGNORED') {
      throw new Error('Webhook Idempotency Failed! Processed duplicate webhook payload.');
    }
    console.log('   ✓ Webhook Idempotency Passed (Duplicate Payload Ignored)');

    // 7. Order Normalization & Phase 4 Interoperability
    console.log('\n8. Testing Order Normalization & Phase 4 Master Order Integration...');
    const rawShopifyOrder = {
      channel: 'SHOPIFY',
      externalOrderId: 'SHP-990011',
      customer: { name: 'Alice Smith', email: 'alice@example.com' },
      items: [{ sku: 'TEST-SKU-PHASE5', quantity: 1, unitPrice: 2500 }],
      totalAmount: 2500,
    };
    const masterOrder = await createOrderService(tenantA, rawShopifyOrder);
    if (masterOrder.channel !== 'SHOPIFY' || masterOrder.externalOrderId !== 'SHP-990011') {
      throw new Error('Master Order Integration from Shopify failed!');
    }
    console.log('   ✓ Order Normalized & Created in Phase 4 Master Order Engine');

    // 8. Exponential Backoff & Rate Limit Handling
    console.log('\n9. Testing Exponential Backoff & 429 Rate Limit Handling...');
    let retryAttempts = 0;
    const mockRateLimitTask = async () => {
      retryAttempts++;
      if (retryAttempts < 2) {
        throw new RateLimitError('Rate limit exceeded test', 0.1, 'SHOPIFY');
      }
      return 'SUCCESS';
    };
    const retryResult = await executeWithRetry(mockRateLimitTask, { maxRetries: 3, initialDelay: 50 });
    if (retryResult !== 'SUCCESS' || retryAttempts !== 2) {
      throw new Error('Rate limit retry handling failed');
    }
    console.log('   ✓ Exponential Backoff & Rate Limit Retry Handled Successfully');

    // 9. Disconnect Channel
    console.log('\n10. Testing Channel Disconnection...');
    const disconn = await disconnectChannelService(tenantA.sellerId, connA._id);
    if (disconn.status !== 'DISCONNECTED') {
      throw new Error('Channel disconnection failed');
    }
    console.log('   ✓ Channel Disconnected Successfully');

    console.log('\n==================================================');
    console.log('ALL PHASE 5 TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ PHASE 5 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase5Tests();
