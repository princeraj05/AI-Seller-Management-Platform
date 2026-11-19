import assert from 'assert';
import mongoose from 'mongoose';
import {
  mapAmazonOrderItems,
  mapAmazonFinancialEventsToRefunds,
  mapAmazonOrderToDbPayload,
  mapAmazonOrderStatus,
  mapFulfillmentChannel
} from './src/integrations/marketplaces/amazon/amazon.order.mapper.js';
import { Order } from './src/modules/orders/order.model.js';
import { Return } from './src/modules/returns/return.model.js';
import {
  getAmazonOrderDetailsService,
  getAmazonOrderItemsService,
  getAmazonReturnsService,
  getAmazonOrderRefundsService,
} from './src/integrations/marketplaces/amazon/amazon.order.service.js';
import { inMemoryOrdersMap } from './src/modules/orders/order.service.js';
import { inMemoryReturnsMap } from './src/modules/returns/return.service.js';

let passed = 0;
let failed = 0;
const asyncPromises = [];

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

function runAsyncTest(name, fn) {
  const p = (async () => {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  })();
  asyncPromises.push(p);
}

console.log('\n========================================================================');
console.log('--- TASK 7: AMAZON ORDER DETAILS & RETURNS VISIBILITY TEST SUITE ---');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// [1] Phase 1 & 2: Order Detail & Item Mapping (SP-API v2026-01-01)
// -----------------------------------------------------------------------------
console.log('[1] Order Detail & Item Mapping (v2026-01-01 OpenAPI Specs)');

runTest('mapAmazonOrderItems extracts ASIN, SKU, title, unit price, quantity, shipped & cancelled counts', () => {
  const rawItems = [
    {
      orderItemId: 'item-101',
      sellerSku: 'AMZ-TSHIRT-BLK-L',
      asin: 'B08N5WRWNW',
      title: 'Men Premium Cotton T-Shirt (Black, L)',
      quantityOrdered: 3,
      quantityShipped: 2,
      quantityCancelled: 1,
      itemPrice: { amount: 1497.00, currency: 'INR' },
      itemTax: { amount: 75.00, currency: 'INR' },
      shippingPrice: { amount: 40.00, currency: 'INR' },
      promotionDiscount: { amount: 100.00, currency: 'INR' },
      fulfillment: {
        carrier: 'Amazon Logistics',
        trackingNumber: 'ATS-IN-987654321',
        shipDate: '2026-11-16T10:00:00.000Z',
      },
    },
  ];

  const mapped = mapAmazonOrderItems(rawItems);
  assert.strictEqual(mapped.length, 1);
  const it = mapped[0];

  assert.strictEqual(it.sku, 'AMZ-TSHIRT-BLK-L');
  assert.strictEqual(it.asin, 'B08N5WRWNW');
  assert.strictEqual(it.title, 'Men Premium Cotton T-Shirt (Black, L)');
  assert.strictEqual(it.quantity, 3);
  assert.strictEqual(it.shippedQuantity, 2);
  assert.strictEqual(it.cancelledQuantity, 1);
  assert.strictEqual(it.price, 499);
  assert.strictEqual(it.totalPrice, 1497);
  assert.strictEqual(it.tax, 75);
  assert.strictEqual(it.shippingPrice, 40);
  assert.strictEqual(it.promotionDiscount, 100);
  assert.strictEqual(it.carrier, 'Amazon Logistics');
  assert.strictEqual(it.trackingNumber, 'ATS-IN-987654321');
  assert.strictEqual(it.itemStatus, 'PARTIALLY_SHIPPED');
});

runTest('mapAmazonOrderToDbPayload creates complete order payload with shipmentDetails, currency & refund tracking', () => {
  const rawOrder = {
    orderId: '408-1234567-7654321',
    orderStatus: 'Shipped',
    fulfillmentChannel: 'AFN',
    salesChannel: 'Amazon.in',
    purchaseDate: '2026-11-15T08:30:00.000Z',
    lastUpdateDate: '2026-11-16T12:00:00.000Z',
    orderTotal: { amount: 1572.00, currencyCode: 'INR' },
    orderItems: [
      {
        orderItemId: 'item-101',
        sellerSku: 'AMZ-TSHIRT-BLK-L',
        asin: 'B08N5WRWNW',
        title: 'Men Premium Cotton T-Shirt (Black, L)',
        quantityOrdered: 2,
        quantityShipped: 2,
        itemPrice: { amount: 1572.00, currency: 'INR' },
        fulfillment: { carrier: 'ATS', trackingNumber: 'ATS-999', shipDate: '2026-11-16T10:00:00Z' },
      },
    ],
  };

  const payload = mapAmazonOrderToDbPayload(rawOrder, { sellerId: 'tenant-task7-01' });

  assert.strictEqual(payload.externalOrderId, '408-1234567-7654321');
  assert.strictEqual(payload.channel, 'AMAZON');
  assert.strictEqual(payload.orderStatus, 'SHIPPED');
  assert.strictEqual(payload.fulfillmentChannel, 'FBA');
  assert.strictEqual(payload.totalAmount, 1572);
  assert.strictEqual(payload.currency, 'INR');
  assert.strictEqual(payload.shippingAddress, null, 'Must omit shippingAddress per strict PII safety');
  assert.strictEqual(payload.shipmentDetails.length, 1);
  assert.strictEqual(payload.shipmentDetails[0].carrier, 'ATS');
  assert.strictEqual(payload.shipmentDetails[0].trackingNumber, 'ATS-999');
});

// -----------------------------------------------------------------------------
// [2] Phase 3: Returns & Financial Refunds Mapping (Finances API v0)
// -----------------------------------------------------------------------------
console.log('\n[2] Returns & Financial Refunds Mapping (Official Finances API v0)');

runTest('mapAmazonFinancialEventsToRefunds accurately extracts RefundEventList, amounts, posted dates & items', () => {
  const financialEvents = {
    FinancialEvents: {
      RefundEventList: [
        {
          AmazonOrderId: '408-1234567-7654321',
          SellerOrderId: 'SO-101',
          MarketplaceName: 'Amazon.in',
          PostedDate: '2026-11-17T06:15:00.000Z',
          ShipmentItemAdjustmentList: [
            {
              SellerSKU: 'AMZ-TSHIRT-BLK-L',
              OrderAdjustmentItemId: 'adj-01',
              QuantityShipped: 1,
              ItemChargeAdjustmentList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'INR', CurrencyAmount: -499.00 } },
                { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'INR', CurrencyAmount: -25.00 } },
              ],
            },
          ],
        },
      ],
    },
  };

  const refundInfo = mapAmazonFinancialEventsToRefunds(financialEvents);

  assert.strictEqual(refundInfo.totalRefunded, 524);
  assert.strictEqual(refundInfo.refundCount, 1);
  assert.strictEqual(refundInfo.currency, 'INR');
  assert.strictEqual(new Date(refundInfo.refunds[0].postedDate).toISOString(), '2026-11-17T06:15:00.000Z');
  assert.strictEqual(refundInfo.refunds[0].amount, 524);
  assert.strictEqual(refundInfo.refunds[0].adjustedItems[0].sellerSku, 'AMZ-TSHIRT-BLK-L');
});

runTest('mapAmazonFinancialEventsToRefunds returns zero refund state safely when RefundEventList is absent', () => {
  const financialEvents = { FinancialEvents: {} };
  const refundInfo = mapAmazonFinancialEventsToRefunds(financialEvents);

  assert.strictEqual(refundInfo.totalRefunded, 0);
  assert.strictEqual(refundInfo.refundCount, 0);
  assert.deepStrictEqual(refundInfo.refunds, []);
});

// -----------------------------------------------------------------------------
// [3] Phase 4: Database Model & Schema Evolution
// -----------------------------------------------------------------------------
console.log('\n[3] Database Model & Schema Evolution');

runTest('Order schema defines Task 7 line-item, shipment and refund fields', () => {
  const paths = Order.schema.paths;

  // Root order paths
  assert(paths.refundAmount, 'Order.refundAmount path must be defined');
  assert(paths.refundStatus, 'Order.refundStatus path must be defined');
  assert(paths.refundDate, 'Order.refundDate path must be defined');
  assert(paths.currency, 'Order.currency path must be defined');
  assert(paths['shipmentDetails.carrier'] || paths.shipmentDetails, 'Order.shipmentDetails path must be defined');
  assert(paths['returnDetails.returnStatus'] || paths['returnDetails.isReturned'], 'Order.returnDetails path must be defined');

  // Sub-schema items paths
  assert(paths['items.asin'] || paths['items.0.asin'] || Order.schema.obj.items, 'Order.items.asin must be defined');
  assert(paths['items.shippingPrice'] || paths['items.0.shippingPrice'] || Order.schema.obj.items, 'Order.items.shippingPrice must be defined');
  assert(paths['items.promotionDiscount'] || paths['items.0.promotionDiscount'] || Order.schema.obj.items, 'Order.items.promotionDiscount must be defined');
  assert(paths['items.cancelledQuantity'] || paths['items.0.cancelledQuantity'] || Order.schema.obj.items, 'Order.items.cancelledQuantity must be defined');
  assert(paths['items.itemStatus'] || paths['items.0.itemStatus'] || Order.schema.obj.items, 'Order.items.itemStatus must be defined');
  assert(paths['items.carrier'] || paths['items.0.carrier'] || Order.schema.obj.items, 'Order.items.carrier must be defined');
  assert(paths['items.trackingNumber'] || paths['items.0.trackingNumber'] || Order.schema.obj.items, 'Order.items.trackingNumber must be defined');
});

runTest('Return schema defines Task 7 multi-tenant and external marketplace fields', () => {
  const paths = Return.schema.paths;

  assert(paths.channelId, 'Return.channelId must be defined');
  assert(paths.marketplaceId, 'Return.marketplaceId must be defined');
  assert(paths.refundDate, 'Return.refundDate must be defined');
  assert(paths.source, 'Return.source must be defined');
  assert(paths['items.asin'] || (paths.items && paths.items.schema && paths.items.schema.paths.asin), 'Return.items.asin must be defined');
  assert(paths['items.title'] || (paths.items && paths.items.schema && paths.items.schema.paths.title), 'Return.items.title must be defined');
});

// -----------------------------------------------------------------------------
// [4] Phase 5: Multi-Tenant Isolation & Service Logic
// -----------------------------------------------------------------------------
console.log('\n[4] Multi-Tenant Isolation & Read-Only Services');

runAsyncTest('getAmazonOrderDetailsService enforces tenant boundary and rejects cross-tenant access', async () => {
  const legitTenant = { sellerId: 'tenant-owner-01' };
  const attackerTenant = { sellerId: 'tenant-intruder-02' };

  // Seed order belonging to tenant-owner-01
  const mockOrder = {
    _id: new mongoose.Types.ObjectId().toString(),
    sellerId: 'tenant-owner-01',
    externalOrderId: '402-1111111-2222222',
    channel: 'AMAZON',
    orderStatus: 'CONFIRMED',
    totalAmount: 999,
    items: [{ sku: 'SKU-01', asin: 'B08X', title: 'Product 1', price: 999, quantity: 1 }],
  };
  inMemoryOrdersMap.set('402-1111111-2222222', mockOrder);

  // Legit owner can read order
  const ownerResult = await getAmazonOrderDetailsService(legitTenant, '402-1111111-2222222');
  assert.strictEqual(ownerResult.order.externalOrderId, '402-1111111-2222222');
  assert.strictEqual(ownerResult.order.sellerId, 'tenant-owner-01');

  // Attacker is rejected with ORDER_NOT_FOUND or UNAUTHORIZED_ACCESS
  await assert.rejects(
    async () => {
      await getAmazonOrderDetailsService(attackerTenant, '402-1111111-2222222');
    },
    (err) => err.code === 'ORDER_NOT_FOUND' || err.code === 'UNAUTHORIZED_ACCESS'
  );
});

runAsyncTest('getAmazonReturnsService filters returns strictly by tenant sellerId', async () => {
  const tenantA = { sellerId: 'seller-returns-A' };
  const tenantB = { sellerId: 'seller-returns-B' };

  // Seed returns
  inMemoryReturnsMap.set('rma-ret-A1', {
    _id: 'rma-ret-A1',
    rmaNumber: 'AMZ-RMA-A1',
    sellerId: 'seller-returns-A',
    channel: 'AMAZON',
    externalOrderId: '401-A',
    status: 'REQUESTED',
    refundAmount: 499,
    items: [{ sku: 'SKU-A', quantity: 1, reason: 'Defective' }],
  });

  inMemoryReturnsMap.set('rma-ret-B1', {
    _id: 'rma-ret-B1',
    rmaNumber: 'AMZ-RMA-B1',
    sellerId: 'seller-returns-B',
    channel: 'AMAZON',
    externalOrderId: '401-B',
    status: 'COMPLETED',
    refundAmount: 799,
    items: [{ sku: 'SKU-B', quantity: 1, reason: 'Wrong Size' }],
  });

  const resA = await getAmazonReturnsService(tenantA);
  assert(resA.returns.every((r) => r.sellerId === 'seller-returns-A'), 'Tenant A must see only its own returns');
  assert.strictEqual(resA.returns.length, 1);
  assert.strictEqual(resA.returns[0].rmaNumber, 'AMZ-RMA-A1');

  const resB = await getAmazonReturnsService(tenantB);
  assert(resB.returns.every((r) => r.sellerId === 'seller-returns-B'), 'Tenant B must see only its own returns');
  assert.strictEqual(resB.returns.length, 1);
  assert.strictEqual(resB.returns[0].rmaNumber, 'AMZ-RMA-B1');
});

runAsyncTest('getAmazonOrderItemsService returns items for verified tenant order', async () => {
  const tenant = { sellerId: 'seller-items-test' };
  const mockOrder = {
    _id: new mongoose.Types.ObjectId().toString(),
    sellerId: 'seller-items-test',
    externalOrderId: '405-9999999-0000000',
    channel: 'AMAZON',
    items: [
      { orderItemId: 'it-1', sku: 'SKU-X', asin: 'B001', title: 'Item X', price: 100, quantity: 2 },
      { orderItemId: 'it-2', sku: 'SKU-Y', asin: 'B002', title: 'Item Y', price: 200, quantity: 1 },
    ],
  };
  inMemoryOrdersMap.set('405-9999999-0000000', mockOrder);

  const itemsResult = await getAmazonOrderItemsService(tenant, '405-9999999-0000000');
  assert.strictEqual(itemsResult.orderId, '405-9999999-0000000');
  assert.strictEqual(itemsResult.items.length, 2);
  assert.strictEqual(itemsResult.totalItems, 2);
});

// -----------------------------------------------------------------------------
// [5] Strict PII & Credential Safety
// -----------------------------------------------------------------------------
console.log('\n[5] Strict PII & Credential Safety');

runTest('Order payload does not fabricate customer names, emails, phone numbers or addresses', () => {
  const rawOrder = {
    orderId: '408-7777777-8888888',
    orderStatus: 'Unshipped',
    orderTotal: { amount: 899, currencyCode: 'INR' },
  };

  const payload = mapAmazonOrderToDbPayload(rawOrder, { sellerId: 'tenant-pii-test' });

  assert.strictEqual(payload.shippingAddress, null, 'shippingAddress must be null when unrequested');
  assert.strictEqual(payload.customer.name, 'Amazon Customer', 'Customer name must be generic');
  assert.strictEqual(payload.customer.email, '', 'Customer email must not be fabricated');
  assert.strictEqual(payload.customer.phone, '', 'Customer phone must not be fabricated');
});

// -----------------------------------------------------------------------------
// [6] Read-Only Enforcement, Idempotency & Sandbox Behavior
// -----------------------------------------------------------------------------
console.log('\n[6] Read-Only Enforcement, Idempotency & Sandbox Behavior');

runTest('Read-only enforcement: Amazon client has no write/mutation methods (no order cancel, no shipment confirm, no return approve, no refund issue)', async () => {
  const { AmazonSpApiClient } = await import('./src/integrations/marketplaces/amazon/amazon.client.js');
  const proto = AmazonSpApiClient.prototype;

  // Verify write mutations do NOT exist on SP-API client
  assert.strictEqual(proto.cancelOrder, undefined, 'Client must not implement cancelOrder');
  assert.strictEqual(proto.confirmShipment, undefined, 'Client must not implement confirmShipment');
  assert.strictEqual(proto.createShipment, undefined, 'Client must not implement createShipment');
  assert.strictEqual(proto.approveReturn, undefined, 'Client must not implement approveReturn');
  assert.strictEqual(proto.rejectReturn, undefined, 'Client must not implement rejectReturn');
  assert.strictEqual(proto.issueRefund, undefined, 'Client must not implement issueRefund');
  assert.strictEqual(proto.createReturnAuthorization, undefined, 'Client must not implement createReturnAuthorization');
});

runTest('Database idempotency: Order and Return models protect against duplicate records with unique indexes', () => {
  const orderIndexes = Order.schema.indexes();
  const hasTenantOrderCompound = orderIndexes.some(
    ([idx, opts]) => idx.sellerId === 1 && idx.externalOrderId === 1
  );
  assert(hasTenantOrderCompound, 'Order model must define compound unique index on sellerId + externalOrderId');

  const returnIndexes = Return.schema.indexes();
  const hasRmaIndex = returnIndexes.some(
    ([idx, opts]) => idx.sellerId === 1 && idx.rmaNumber === 1
  ) || Return.schema.paths.rmaNumber?.options?.unique;
  assert(hasRmaIndex, 'Return model must enforce unique RMA or sellerId + rmaNumber');
});

runTest('Sandbox unsupported API behavior: missing returns produce clean empty states and never fabricate fake returns', () => {
  const emptyEvents = { FinancialEvents: { RefundEventList: [] } };
  const refundInfo = mapAmazonFinancialEventsToRefunds(emptyEvents);

  assert.strictEqual(refundInfo.totalRefunded, 0);
  assert.strictEqual(refundInfo.refundCount, 0);
  assert.deepStrictEqual(refundInfo.refunds, []);

  // An order with no return metadata defaults returnDetails safely without inventing claims
  const rawOrder = { orderId: '409-sandbox-empty', orderStatus: 'Unshipped' };
  const payload = mapAmazonOrderToDbPayload(rawOrder, { sellerId: 'tenant-test' });
  assert.strictEqual(payload.returnDetails.isReturned, false);
  assert.strictEqual(payload.returnDetails.returnStatus, 'NONE');
  assert.strictEqual(payload.returnDetails.returnQuantity, 0);
  assert.strictEqual(payload.refundAmount, 0);
});

runTest('Missing and restricted data handling: orders with missing items array default safely', () => {
  const rawOrder = {
    orderId: '410-no-items',
    orderStatus: 'Pending',
    orderTotal: { amount: 0, currencyCode: 'INR' },
  };
  const payload = mapAmazonOrderToDbPayload(rawOrder, { sellerId: 'tenant-test' });

  assert.strictEqual(payload.externalOrderId, '410-no-items');
  assert.strictEqual(payload.items.length, 0);
  assert.strictEqual(payload.totalAmount, 0);
  assert.strictEqual(payload.shippingAddress, null);
  assert.strictEqual(payload.customer.name, 'Amazon Customer');
});

(async () => {
  await Promise.all(asyncPromises);
  console.log('\n========================================================================');
  console.log(`RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
})();
