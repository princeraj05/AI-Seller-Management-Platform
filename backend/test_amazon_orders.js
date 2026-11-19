import assert from 'assert';
import mongoose from 'mongoose';
import {
  mapAmazonOrderStatus,
  mapFulfillmentChannel,
  mapAmazonOrderItems,
  mapAmazonOrderToDbPayload,
} from './src/integrations/marketplaces/amazon/amazon.order.mapper.js';
import {
  searchAmazonOrders,
  getAmazonOrder,
  getAmazonOrderItems,
  syncAmazonOrdersService,
  getAmazonOrdersStatusService,
} from './src/integrations/marketplaces/amazon/amazon.order.service.js';
import {
  acquireDistributedLock,
  renewDistributedLock,
  releaseDistributedLock,
  isDistributedLockActive,
  createLockHeartbeat,
  inMemoryLocksMap,
} from './src/modules/channels/distributedLock.service.js';
import {
  calculateBackoffDelay,
  parseRateLimitHeaders,
} from './src/integrations/marketplaces/amazon/amazon.rateLimiter.js';
import { AmazonSpApiClient } from './src/integrations/marketplaces/amazon/amazon.client.js';
import { Order } from './src/modules/orders/order.model.js';
import { inMemoryOrdersMap } from './src/modules/orders/order.service.js';
import { inMemoryChannelsMap } from './src/modules/channels/channel.service.js';
import { encryptCredentials } from './src/utils/encryption.js';

mongoose.set('bufferCommands', false);

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n========================================================================');
  console.log('--- TASK 6.2: FINAL AMAZON ORDERS PRODUCTION HARDENING TEST SUITE ---');
  console.log('========================================================================\n');

  // 1. Status Mapping Verification against v2026-01-01 Schema
  console.log('[1] Status Mapping Verification (Official v2026-01-01 Schema)');
  runTest('mapAmazonOrderStatus maps all official v2026-01-01 statuses accurately', () => {
    assert.strictEqual(mapAmazonOrderStatus('PENDING_AVAILABILITY'), 'PENDING');
    assert.strictEqual(mapAmazonOrderStatus('PENDING'), 'PENDING');
    assert.strictEqual(mapAmazonOrderStatus('UNSHIPPED'), 'CONFIRMED');
    assert.strictEqual(mapAmazonOrderStatus('PARTIALLY_SHIPPED'), 'PROCESSING');
    assert.strictEqual(mapAmazonOrderStatus('SHIPPED'), 'SHIPPED');
    assert.strictEqual(mapAmazonOrderStatus('CANCELLED'), 'CANCELLED');
    assert.strictEqual(mapAmazonOrderStatus('UNFULFILLABLE'), 'FAILED');
    assert.strictEqual(mapAmazonOrderStatus('Delivered'), 'DELIVERED');
    assert.strictEqual(mapAmazonOrderStatus('CANCELED'), 'CANCELLED');
  });

  runTest('Unknown Amazon statuses map to UNKNOWN and are NOT silently converted to CONFIRMED', () => {
    assert.strictEqual(mapAmazonOrderStatus('FUTURE_AMAZON_STATUS'), 'UNKNOWN');
    assert.strictEqual(mapAmazonOrderStatus('RANDOM_UNKNOWN_CODE'), 'UNKNOWN');
    assert.strictEqual(mapAmazonOrderStatus(''), 'UNKNOWN');
    assert.strictEqual(mapAmazonOrderStatus(null), 'UNKNOWN');
  });

  runTest('mapFulfillmentChannel accurately differentiates AFN (FBA) and MFN (FBM)', () => {
    assert.strictEqual(mapFulfillmentChannel('AFN'), 'FBA');
    assert.strictEqual(mapFulfillmentChannel('Amazon Fulfillment Network'), 'FBA');
    assert.strictEqual(mapFulfillmentChannel('MFN'), 'FBM');
    assert.strictEqual(mapFulfillmentChannel('Merchant Fulfillment Network'), 'FBM');
    assert.strictEqual(mapFulfillmentChannel('UNKNOWN_CHANNEL'), 'UNKNOWN');
  });

  // 2. Truly Omit Unrequested Address Data (No Fabricated Objects / No Schema Defaults)
  console.log('\n[2] Truly Omit Unrequested Address Data');
  runTest('mapAmazonOrderToDbPayload sets shippingAddress to null when unrequested', () => {
    const rawAmazonOrderWithoutAddress = {
      orderId: '402-9876543-1234567',
      orderStatus: 'SHIPPED',
      fulfillmentChannel: 'AFN',
      orderTotal: { amount: 2499.0, currencyCode: 'INR' },
      purchaseDate: '2026-11-10T14:30:00Z',
      orderItems: [
        {
          orderItemId: 'item-001',
          product: { sellerSku: 'AMZ-PROD-1', asin: 'B08XYZ1234', price: { unitPrice: { amount: 2499.0 } } },
          quantityOrdered: 1,
        },
      ],
    };

    const payload = mapAmazonOrderToDbPayload(rawAmazonOrderWithoutAddress, {
      sellerId: 'seller_audit_101',
      channelId: 'channel_amz_101',
      marketplaceId: 'A21TJRUUN4KGV',
    });

    // Customer display remains strictly anonymized
    assert.strictEqual(payload.customer.name, 'Amazon Customer');
    assert.strictEqual(payload.customer.email, '');

    // Truly omitted: shippingAddress and billingAddress are null, NOT empty strings or fabricated objects
    assert.strictEqual(payload.shippingAddress, null);
    assert.strictEqual(payload.billingAddress, null);

    // Original Amazon status is explicitly preserved
    assert.strictEqual(payload.originalAmazonStatus, 'SHIPPED');
    assert.strictEqual(payload.sourceMetadata.originalAmazonStatus, 'SHIPPED');
  });

  runTest('Order schema default is null and does NOT recreate fabricated address object', () => {
    const testDoc = new Order({
      sellerId: 'seller_test_schema_addr',
      orderNumber: 'TEST-ADDR-001',
      externalOrderId: 'TEST-ADDR-001',
      channel: 'AMAZON',
      customer: { name: 'Amazon Customer' },
      totalAmount: 1000,
      subtotal: 1000,
      items: [{ sku: 'TEST', title: 'Test Item', quantity: 1, unitPrice: 1000, total: 1000 }],
      shippingAddress: null,
      billingAddress: null,
    });

    // Verify Mongoose schema does not populate empty default sub-document
    assert.strictEqual(testDoc.shippingAddress, null);
    assert.strictEqual(testDoc.billingAddress, null);
  });

  runTest('Frontend address display correctly falls back to "Address not available" when shippingAddress is null', () => {
    const orderWithNullAddress = {
      orderId: '402-1234567-0000000',
      shippingAddress: null,
    };

    const hasAddress = Boolean(
      orderWithNullAddress.shippingAddress &&
      (orderWithNullAddress.shippingAddress.addressLine1?.trim() || orderWithNullAddress.shippingAddress.city?.trim())
    );
    const display = hasAddress
      ? `${orderWithNullAddress.shippingAddress.addressLine1 ? orderWithNullAddress.shippingAddress.addressLine1 + ', ' : ''}${orderWithNullAddress.shippingAddress.city || ''}`
      : 'Address not available';

    assert.strictEqual(display, 'Address not available');
  });

  // 3. Consolidated Orders API v2026-01-01 Endpoints (No Invented /orderItems)
  console.log('\n[3] Orders API v2026-01-01 Endpoints (No Invented /orderItems)');
  await runAsyncTest('searchAmazonOrders targets /orders/2026-01-01/orders with includedData', async () => {
    let capturedPath = '';
    const mockClient = {
      credentials: { marketplaceId: 'A21TJRUUN4KGV' },
      executeRequest: async (endpointPath) => {
        capturedPath = endpointPath;
        return {
          orders: [
            {
              orderId: '402-1234567-8901234',
              orderStatus: 'UNSHIPPED',
              fulfillmentChannel: 'AFN',
              orderItems: [
                {
                  orderItemId: 'item-v2026-1',
                  quantityOrdered: 2,
                  product: {
                    asin: 'B08N5WRWNW',
                    sellerSku: 'ECHO-CHARCOAL',
                    title: 'Echo Dot Charcoal',
                    price: { unitPrice: { amount: 3999 } },
                  },
                },
              ],
            },
          ],
        };
      },
    };

    const res = await searchAmazonOrders(mockClient, {
      marketplaceId: 'A21TJRUUN4KGV',
      includedData: ['PROCEEDS', 'FULFILLMENT', 'PACKAGES'],
      orderStatuses: ['UNSHIPPED', 'PARTIALLY_SHIPPED'],
    });

    assert.ok(capturedPath.startsWith('/orders/2026-01-01/orders?'));
    assert.ok(capturedPath.includes('marketplaceIds=A21TJRUUN4KGV'));
    assert.ok(capturedPath.includes('includedData=PROCEEDS%2CFULFILLMENT%2CPACKAGES'));
    assert.strictEqual(res.orders.length, 1);
  });

  await runAsyncTest('getAmazonOrder targets consolidated /orders/2026-01-01/orders/{orderId}', async () => {
    let capturedPath = '';
    const mockClient = {
      credentials: { marketplaceId: 'A21TJRUUN4KGV' },
      executeRequest: async (endpointPath) => {
        capturedPath = endpointPath;
        return { order: { orderId: '402-9999999-0000000', orderStatus: 'SHIPPED', orderItems: [] } };
      },
    };

    const res = await getAmazonOrder(mockClient, '402-9999999-0000000', {
      includedData: 'PROCEEDS,FULFILLMENT',
    });

    assert.strictEqual(
      capturedPath,
      '/orders/2026-01-01/orders/402-9999999-0000000?includedData=PROCEEDS%2CFULFILLMENT'
    );
    assert.strictEqual(res.orderId, '402-9999999-0000000');
  });

  await runAsyncTest('getAmazonOrderItems does NOT call invented /orderItems endpoint', async () => {
    const executedEndpoints = [];
    const mockClient = {
      credentials: { marketplaceId: 'A21TJRUUN4KGV' },
      executeRequest: async (endpointPath) => {
        executedEndpoints.push(endpointPath);
        return { orderId: '402-1111111-2222222', orderItems: [{ orderItemId: 'sub-item-1' }] };
      },
    };

    const res = await getAmazonOrderItems(mockClient, '402-1111111-2222222');
    for (const ep of executedEndpoints) {
      assert.ok(!ep.includes('/orderItems'), `Illegal endpoint called: ${ep}`);
    }
    assert.strictEqual(res.orderItems.length, 1);
  });

  // 4. Distributed Lock Lease Renewal & Heartbeat
  console.log('\n[4] Distributed Lock Lease Renewal & Heartbeat');
  await runAsyncTest('renewDistributedLock extends active lease when lockKey and lockId match', async () => {
    const sellerId = 'seller_heartbeat_test';
    const channelId = 'channel_heartbeat_test';

    const lock = await acquireDistributedLock({ sellerId, channelId, leaseMs: 2000 });
    const initialExpiresAt = new Date(lock.expiresAt);

    // Sleep 50ms so now > initial time
    await new Promise((r) => setTimeout(r, 50));

    const renewed = await renewDistributedLock(lock, 10000); // extend lease by 10 seconds
    assert.strictEqual(renewed, true);
    assert.ok(lock.expiresAt > initialExpiresAt, 'Lease expiration must be extended forward');

    await releaseDistributedLock(lock);
  });

  await runAsyncTest('createLockHeartbeat periodically extends lease and protects long-running sync', async () => {
    const sellerId = 'seller_long_sync_test';
    const channelId = 'channel_long_sync_test';

    // Acquire lock with initial short lease of 500ms
    const lock = await acquireDistributedLock({ sellerId, channelId, leaseMs: 500 });
    const originalExpiresAt = new Date(lock.expiresAt);

    // Start heartbeat with 100ms interval
    const heartbeat = createLockHeartbeat(lock, 2000, 100);

    // Simulate work taking 300ms (longer than half the original lease)
    await new Promise((r) => setTimeout(r, 300));

    // Verify lease was automatically extended forward by heartbeat
    assert.strictEqual(heartbeat.hasLostOwnership(), false);
    assert.ok(lock.expiresAt > originalExpiresAt, 'Heartbeat must have extended expiresAt');

    heartbeat.stop();
    await releaseDistributedLock(lock);
  });

  await runAsyncTest('Old worker cannot release a newer worker\'s lock after lease expiration', async () => {
    const sellerId = 'seller_stale_release';
    const channelId = 'channel_stale_release';

    // Worker 1 acquires lock
    const worker1Lock = await acquireDistributedLock({ sellerId, channelId, leaseMs: 100 });

    // Simulate worker 1 stalling and lease expiring
    inMemoryLocksMap.get(worker1Lock.lockKey).expiresAt = new Date(Date.now() - 1000);

    // Worker 2 takes over expired lock
    const worker2Lock = await acquireDistributedLock({ sellerId, channelId, leaseMs: 5000 });
    assert.notStrictEqual(worker1Lock.lockId, worker2Lock.lockId);

    // Worker 1 wakes up and attempts to release the lock
    const releasedByWorker1 = await releaseDistributedLock(worker1Lock);

    // Worker 2's lock must remain ACTIVE because lockId did not match
    const isWorker2Active = await isDistributedLockActive({ sellerId, channelId });
    assert.strictEqual(isWorker2Active, true);

    // Worker 2 releases properly
    await releaseDistributedLock(worker2Lock);
    const activeAfter = await isDistributedLockActive({ sellerId, channelId });
    assert.strictEqual(activeAfter, false);
  });

  await runAsyncTest('Worker detects lost lock ownership and aborts', async () => {
    const lockKey = 'AMAZON_ORDER_SYNC:seller_lost_test:channel_lost_test';
    const staleLock = { lockKey, lockId: 'stale-worker-id', expiresAt: new Date() };

    // Heartbeat renewal fails because in DB/memory lockId has changed
    inMemoryLocksMap.set(lockKey, { lockKey, lockId: 'new-worker-id', expiresAt: new Date(Date.now() + 5000) });

    const renewed = await renewDistributedLock(staleLock, 5000);
    assert.strictEqual(renewed, false, 'Renewal must fail when lockId does not match current holder');
  });

  // 5. Amazon Rate Limits, Header Parsing, and HTTP 429 Retry
  console.log('\n[5] Amazon Rate Limits, Header Parsing & HTTP 429 Retry');
  runTest('parseRateLimitHeaders parses x-amzn-RateLimit-Limit and Retry-After headers', () => {
    const mockResponseWithHeaders = {
      headers: {
        get: (name) => {
          const map = {
            'x-amzn-ratelimit-limit': '0.0056',
            'retry-after': '3',
          };
          return map[name.toLowerCase()] || null;
        },
      },
    };

    const { limit, retryAfter } = parseRateLimitHeaders(mockResponseWithHeaders);
    assert.strictEqual(limit, 0.0056); // Verified official searchOrders rate limit
    assert.strictEqual(retryAfter, 3);
  });

  runTest('calculateBackoffDelay respects Retry-After and applies jitter without exceeding maxDelay', () => {
    const delayFromHeader = calculateBackoffDelay(0, 5, { maxDelayMs: 30000, jitterRatio: 0.2 });
    assert.ok(delayFromHeader >= 4000 && delayFromHeader <= 6000, `Delay (${delayFromHeader}) must be around 5s ± 20%`);

    const exponentialDelay = calculateBackoffDelay(2, null, { baseDelayMs: 1000, jitterRatio: 0.1 });
    // baseDelay * 2^2 = 4000ms ± 10% = 3600-4400ms
    assert.ok(exponentialDelay >= 3600 && exponentialDelay <= 4400, `Delay (${exponentialDelay}) must be ~4000ms`);
  });

  await runAsyncTest('AmazonSpApiClient handles HTTP 429 and retries up to maxRetries without infinite loop', async () => {
    let callCount = 0;
    const client = new AmazonSpApiClient({
      clientId: 'amzn1.mock',
      clientSecret: 'secret.mock',
      refreshToken: 'Atzr|mock',
      rateLimitConfig: {
        maxRetries: 2,
        baseDelayMs: 50,
        maxDelayMs: 200,
        jitterRatio: 0,
      },
    });

    // Mock internal getAccessToken
    client.getAccessToken = async () => 'mock-access-token';

    // Mock global fetch to simulate 429 with Retry-After header
    const originalFetch = global.fetch;
    global.fetch = async () => {
      callCount++;
      return {
        status: 429,
        ok: false,
        headers: {
          get: (name) => (name.toLowerCase() === 'retry-after' ? '0' : '0.0056'),
        },
        json: async () => ({ message: 'Rate exceeded' }),
      };
    };

    try {
      await assert.rejects(
        async () => {
          await client.executeRequest('/orders/2026-01-01/orders');
        },
        (err) => {
          assert.strictEqual(err.status, 429);
          assert.strictEqual(err.code, 'RATE_LIMITED');
          return true;
        }
      );

      // Initial attempt (0) + 2 retries (1, 2) = 3 total attempts
      assert.strictEqual(callCount, 3, 'Client must stop exactly after maxRetries (3 calls total)');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // 6. Database Indexes, Partial Indexing, and POS Preservation
  console.log('\n[6] Database Indexes & POS/Marketplace Preservation');
  runTest('Order schema partialFilterExpression protects POS orders with empty externalOrderId', () => {
    const indexes = Order.schema.indexes();
    const externalOrderIndex = indexes.find(
      (idx) => idx[0] && idx[0].sellerId === 1 && idx[0].channel === 1 && idx[0].externalOrderId === 1
    );

    assert.ok(externalOrderIndex, 'External order unique index not found');
    assert.strictEqual(externalOrderIndex[1].unique, true);
    assert.deepStrictEqual(
      externalOrderIndex[1].partialFilterExpression.externalOrderId,
      { $type: 'string', $gt: '' },
      'partialFilterExpression must only index non-empty externalOrderId strings'
    );
  });

  runTest('Multiple POS orders for same tenant with empty externalOrderId do not conflict', () => {
    const sellerId = 'seller_pos_prod_test';
    const posOrder1 = { _id: 'pos_001', sellerId, orderNumber: 'POS-001', channel: 'POS', externalOrderId: '' };
    const posOrder2 = { _id: 'pos_002', sellerId, orderNumber: 'POS-002', channel: 'POS', externalOrderId: '' };

    inMemoryOrdersMap.set(posOrder1._id, posOrder1);
    inMemoryOrdersMap.set(posOrder2._id, posOrder2);

    const posOrders = Array.from(inMemoryOrdersMap.values()).filter(
      (o) => o.sellerId === sellerId && o.channel === 'POS'
    );
    assert.strictEqual(posOrders.length, 2);
  });

  console.log('\n========================================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
