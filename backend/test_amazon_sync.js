import assert from 'assert';
import mongoose from 'mongoose';
import {
  extractCatalogSummary,
  extractListingSummary,
  mapListingToDbPayload,
} from './src/integrations/marketplaces/amazon/amazon.product.mapper.js';
import {
  syncAmazonSellerListingsService,
  getAmazonSyncStatusService,
} from './src/integrations/marketplaces/amazon/amazon.sync.service.js';
import {
  inMemoryChannelsMap,
  inMemoryListingsMap,
  inMemorySyncHistoryMap,
} from './src/modules/channels/channel.service.js';
import { MarketplaceListing } from './src/modules/channels/marketplaceListing.model.js';

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
  console.log('\n======================================================');
  console.log('--- TASK 4: AMAZON CATALOG & LISTINGS SYNC TEST SUITE ---');
  console.log('======================================================\n');

  // 1. Catalog Items Mapper (v2022-04-01)
  console.log('[1] Catalog Items API Mapper (v2022-04-01)');
  runTest('extractCatalogSummary normalizes Amazon catalog item correctly', () => {
    const rawCatalogItem = {
      asin: 'B08N5WRWNW',
      summaries: [
        {
          marketplaceId: 'A21TJRUUN4KGV',
          itemName: 'Amazon Echo Dot (4th Gen) Smart Speaker',
          brand: 'Amazon',
          manufacturer: 'Amazon Technologies Inc.',
          modelNumber: 'B08N5WRWNW',
          productType: 'SPEAKERS',
          color: 'Black',
        },
      ],
      images: [
        {
          marketplaceId: 'A21TJRUUN4KGV',
          images: [
            { variant: 'MAIN', link: 'https://m.media-amazon.com/images/I/echo-main.jpg', height: 500, width: 500 },
            { variant: 'PT01', link: 'https://m.media-amazon.com/images/I/echo-side.jpg', height: 500, width: 500 },
          ],
        },
      ],
      identifiers: [
        {
          marketplaceId: 'A21TJRUUN4KGV',
          identifiers: [
            { identifierType: 'UPC', identifier: '840080588667' },
            { identifierType: 'EAN', identifier: '0840080588667' },
          ],
        },
      ],
      salesRanks: [
        {
          marketplaceId: 'A21TJRUUN4KGV',
          classificationRanks: [{ rank: 1, title: 'Smart Speakers', link: 'https://amazon.in/ranks' }],
        },
      ],
    };

    const normalized = extractCatalogSummary(rawCatalogItem, 'A21TJRUUN4KGV');
    assert.strictEqual(normalized.asin, 'B08N5WRWNW');
    assert.strictEqual(normalized.title, 'Amazon Echo Dot (4th Gen) Smart Speaker');
    assert.strictEqual(normalized.brand, 'Amazon');
    assert.strictEqual(normalized.mainImageUrl, 'https://m.media-amazon.com/images/I/echo-main.jpg');
    assert.strictEqual(normalized.identifiers.UPC, '840080588667');
    assert.strictEqual(normalized.salesRanks[0]?.rank, 1);
  });

  // 2. Listings Items Mapper (v2021-08-01)
  console.log('\n[2] Listings Items API Mapper (v2021-08-01)');
  runTest('extractListingSummary normalizes seller listing item correctly', () => {
    const rawListing = {
      sku: 'ECHO-DOT-BLK-01',
      summaries: [
        {
          marketplaceId: 'A21TJRUUN4KGV',
          asin: 'B08N5WRWNW',
          itemName: 'Echo Dot 4th Gen Black',
          productType: 'SPEAKERS',
          conditionType: 'new_new',
          status: ['BUYABLE', 'DISCOVERABLE'],
          mainImage: { link: 'https://m.media-amazon.com/images/I/echo-main.jpg' },
        },
      ],
      offers: [
        {
          marketplaceId: 'A21TJRUUN4KGV',
          price: { amount: 3999, currency: 'INR' },
        },
      ],
      fulfillmentAvailability: [
        {
          quantity: 45,
        },
      ],
      issues: [
        {
          code: '90122',
          message: 'The value specified is invalid.',
          severity: 'WARNING',
          attributeNames: ['item_name'],
        },
      ],
    };

    const normalized = extractListingSummary(rawListing, 'A21TJRUUN4KGV');
    assert.strictEqual(normalized.sku, 'ECHO-DOT-BLK-01');
    assert.strictEqual(normalized.asin, 'B08N5WRWNW');
    assert.strictEqual(normalized.status, 'PUBLISHED');
    assert.strictEqual(normalized.price, 3999);
    assert.strictEqual(normalized.currency, 'INR');
    assert.strictEqual(normalized.quantity, 45);
    assert.strictEqual(normalized.issues.length, 1);
    assert.strictEqual(normalized.issues[0].severity, 'WARNING');
  });

  // 3. Product Mapping & Master Field Preservation
  console.log('\n[3] Product Mapping & Master Field Preservation');
  runTest('mapListingToDbPayload links internal product without altering master product', () => {
    const normalized = {
      sku: 'PROD-SKU-100',
      asin: 'B07TEST123',
      title: 'Amazon Listing Title (May differ from Master)',
      price: 999,
      currency: 'INR',
      quantity: 15,
      status: 'PUBLISHED',
      imageUrl: 'https://img.com/prod.jpg',
      issues: [],
      amazonStatuses: ['BUYABLE'],
      conditionType: 'new_new',
      productType: 'PRODUCT',
    };

    const internalMasterProductId = 'master-prod-id-999';
    const dbPayload = mapListingToDbPayload(normalized, {
      sellerId: 'tenant-100',
      channelId: 'chan-amazon-1',
      internalProductId: internalMasterProductId,
    });

    assert.strictEqual(dbPayload.productId, internalMasterProductId);
    assert.strictEqual(dbPayload.externalSku, 'PROD-SKU-100');
    assert.strictEqual(dbPayload.asin, 'B07TEST123');
    assert.strictEqual(dbPayload.sellerId, 'tenant-100');
    assert.strictEqual(dbPayload.status, 'PUBLISHED');
  });

  // 4. Missing Authorization & Disconnected Safety
  console.log('\n[4] Missing Authorization & Error Safety');
  await runAsyncTest('sync rejects tenants without an Amazon connection', async () => {
    await assert.rejects(
      async () => {
        await syncAmazonSellerListingsService({ sellerId: 'unconnected-tenant-xyz' });
      },
      /Amazon channel connection not found/
    );
  });

  await runAsyncTest('sync rejects disconnected Amazon channels', async () => {
    const tenantId = 'tenant-disconnected-test-123';
    inMemoryChannelsMap.set('chan-disc-1', {
      _id: 'chan-disc-1',
      id: 'chan-disc-1',
      sellerId: tenantId,
      provider: 'AMAZON',
      status: 'DISCONNECTED',
      credentials: null,
    });

    await assert.rejects(
      async () => {
        await syncAmazonSellerListingsService({ sellerId: tenantId });
      },
      /Amazon channel is not active/
    );
  });

  // 5. Multi-Tenant Isolation & Compound Indexes
  console.log('\n[5] Multi-Tenant Isolation & Compound Index Definition');
  runTest('MarketplaceListing model defines compound index on sellerId, channelId, externalSku', () => {
    const indexes = MarketplaceListing.schema.indexes();
    const hasSkuIndex = indexes.some(
      ([fields, opts]) =>
        fields.sellerId === 1 && fields.channelId === 1 && fields.externalSku === 1 && opts.unique === true
    );
    assert(hasSkuIndex, 'Missing unique compound index on { sellerId: 1, channelId: 1, externalSku: 1 }');
  });

  // 6. Idempotent Sync & Sync History Tracking
  console.log('\n[6] Idempotent Sync Tracking & Status');
  await runAsyncTest('getAmazonSyncStatusService returns status and history accurately', async () => {
    const tenantId = 'tenant-sync-status-test-456';
    inMemorySyncHistoryMap.set('sync-log-1', {
      _id: 'sync-log-1',
      id: 'sync-log-1',
      sellerId: tenantId,
      provider: 'AMAZON',
      syncType: 'AMAZON_LISTINGS',
      status: 'SUCCESS',
      startedAt: new Date(Date.now() - 60000),
      completedAt: new Date(),
      recordsProcessed: 5,
      recordsSucceeded: 5,
      recordsFailed: 0,
      totalCreated: 5,
      totalUpdated: 0,
    });

    inMemoryListingsMap.set('list-1', {
      _id: 'list-1',
      sellerId: tenantId,
      provider: 'AMAZON',
      externalSku: 'SKU-001',
    });

    const status = await getAmazonSyncStatusService({ sellerId: tenantId });
    assert(status.latestSync, 'Missing latestSync');
    assert.strictEqual(status.latestSync.status, 'SUCCESS');
    assert.strictEqual(status.latestSync.recordsSucceeded, 5);
    assert(status.totalListings >= 1, 'Should reflect listings count');
  });

  console.log('\n======================================================');
  console.log(`RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
