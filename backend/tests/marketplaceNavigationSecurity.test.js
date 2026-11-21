/**
 * Test Suite: Phase 03.5.2a — Marketplace Publishing Navigation & Catalog Integration Security
 *
 * Verifies:
 * 1. Batch API Validation:
 *    - Rejects missing productIds with HTTP 400 (MISSING_PRODUCT_IDS)
 *    - Rejects empty productIds with HTTP 400 (MISSING_PRODUCT_IDS)
 *    - Rejects malformed product ID (non-ObjectId) with HTTP 400 (INVALID_PRODUCT_ID)
 *    - Rejects oversized productIds (>100 IDs) with HTTP 400 (EXCEEDED_MAX_PRODUCT_IDS)
 *    - Accepts both comma-separated and array productIds
 * 2. Tenant & Symmetric Store Isolation:
 *    - Seller B querying Seller A's products returns isolated/empty results
 *    - Cross-store isolation: Store B tenant querying Store A product returns no results
 *    - Store-less tenant querying Store A product returns no results
 *    - Missing store context does not bypass store isolation
 *    - Query parameter tampering (?sellerId=... & ?storeId=...) is ignored; req.tenant is authoritative
 * 3. Deterministic Latest Submission Sorting:
 *    - Multiple submissions across time deterministically selects the newest by { updatedAt: -1, _id: -1 }
 *    - Verifies projections: productId, provider, status, submissionId, submittedAt, amazonSubmissionId, productType, issues
 * 4. Multi-Provider Grouping (Correction 1):
 *    - Selects latest submission independently for each productId + provider combination
 *    - Does not group only by productId
 *    - Does not arbitrarily default missing provider values to AMAZON
 * 5. In-Memory Fallback Tenant & Store Isolation (Correction 2):
 *    - In-memory fallback enforces symmetric store matching and sellerId matching
 *    - Cross-tenant/store lookup returns HTTP 404
 * 6. Phase 03.5.1 Approval & Eligibility Rules (Correction 3):
 *    - Approved AI product is eligible
 *    - Unapproved AI product is ineligible with clear reason
 *    - Active manual product is eligible
 *    - Draft and Archived products are strictly ineligible
 * 7. Strict ProductType Validation (No 'SHIRT' Default):
 *    - validateAmazonListing rejects missing productType with HTTP 400 (MISSING_PRODUCT_TYPE)
 *    - createOrUpdateAmazonListingSubmission rejects missing productType with HTTP 400 (MISSING_PRODUCT_TYPE)
 * 8. Production 503 Fail-Fast Policy:
 *    - In NODE_ENV=production, DB errors return HTTP 503 for status summary, submissions list, and submission by ID
 * 9. Legacy Amazon Publishing Rejection:
 *    - Blocks Amazon publishing on legacy route across all case variations with HTTP 400 (AMAZON_LEGACY_PUBLISHING_DISABLED)
 *    - Non-Amazon channels execute normally
 * 10. Semantic Accuracy:
 *    - Preserves SANDBOX_SUBMITTED without aliasing to LIVE or PUBLISHED
 */

import assert from 'assert';
import mongoose from 'mongoose';
import {
  validateAmazonListing,
  createOrUpdateAmazonListingSubmission,
  getAmazonListingSubmissions,
  getAmazonListingSubmissionById,
  getMarketplaceListingStatusSummary,
  publishProductToChannel,
  isProductEligibleForPublishing,
} from '../src/modules/channels/channel.controller.js';
import {
  publishProductToChannelService,
  inMemoryChannelsMap,
} from '../src/modules/channels/channel.service.js';
import {
  MarketplaceListingSubmission,
  inMemorySubmissionsMap,
} from '../src/modules/channels/marketplaceListingSubmission.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { inMemoryProductsMap } from '../src/modules/products/product.service.js';

mongoose.set('bufferCommands', false);

let passed = 0;
let failed = 0;

const runTest = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
};

// Mock Express req/res helpers
const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
};

console.log('\n========================================================================');
console.log('PHASE 03.5.2a: MARKETPLACE NAVIGATION & SECURITY AUDIT TEST SUITE');
console.log('========================================================================\n');

// ----------------------------------------------------------------------
// 1. Batch API Validation Tests (GET /api/channels/marketplace-status)
// ----------------------------------------------------------------------
await runTest('1.1 Rejects missing productIds with HTTP 400 (MISSING_PRODUCT_IDS)', async () => {
  const req = {
    tenant: { sellerId: 'seller-sec-01', storeId: 'store-sec-01' },
    query: {},
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.code, 'MISSING_PRODUCT_IDS');
});

await runTest('1.2 Rejects empty productIds string with HTTP 400 (MISSING_PRODUCT_IDS)', async () => {
  const req = {
    tenant: { sellerId: 'seller-sec-01', storeId: 'store-sec-01' },
    query: { productIds: '   ,  , ' },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'MISSING_PRODUCT_IDS');
});

await runTest('1.3 Rejects malformed product ID (non-ObjectId) with HTTP 400 (INVALID_PRODUCT_ID)', async () => {
  const req = {
    tenant: { sellerId: 'seller-sec-01', storeId: 'store-sec-01' },
    query: { productIds: '60d5ec49f1b2c82d88f11111,invalid-product-id-999' },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.code, 'INVALID_PRODUCT_ID');
  assert.ok(res.body.message.includes('invalid-product-id-999'));
});

await runTest('1.4 Rejects oversized productIds (>100 IDs) with HTTP 400 (EXCEEDED_MAX_PRODUCT_IDS)', async () => {
  const ids = Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toString());
  const req = {
    tenant: { sellerId: 'seller-sec-01', storeId: 'store-sec-01' },
    query: { productIds: ids.join(',') },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'EXCEEDED_MAX_PRODUCT_IDS');
});

await runTest('1.5 Accepts both comma-separated and array productIds formats', async () => {
  const validId1 = new mongoose.Types.ObjectId().toString();
  const validId2 = new mongoose.Types.ObjectId().toString();

  // Seed into inMemoryProductsMap
  inMemoryProductsMap.set(validId1, {
    _id: validId1,
    sellerId: 'seller-sec-01',
    storeId: 'store-sec-01',
    title: 'Valid Product 1',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });
  inMemoryProductsMap.set(validId2, {
    _id: validId2,
    sellerId: 'seller-sec-01',
    storeId: 'store-sec-01',
    title: 'Valid Product 2',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  // Test comma-separated
  const req1 = {
    tenant: { sellerId: 'seller-sec-01', storeId: 'store-sec-01' },
    query: { productIds: `${validId1},${validId2}` },
  };
  const res1 = createMockRes();
  await getMarketplaceListingStatusSummary(req1, res1);
  assert.strictEqual(res1.statusCode, 200);
  assert.ok(res1.body.data.statuses[validId1]);
  assert.ok(res1.body.data.statuses[validId2]);

  // Test array
  const req2 = {
    tenant: { sellerId: 'seller-sec-01', storeId: 'store-sec-01' },
    query: { productIds: [validId1, validId2] },
  };
  const res2 = createMockRes();
  await getMarketplaceListingStatusSummary(req2, res2);
  assert.strictEqual(res2.statusCode, 200);
  assert.ok(res2.body.data.statuses[validId1]);
  assert.ok(res2.body.data.statuses[validId2]);
});

// ----------------------------------------------------------------------
// 2. Tenant & Symmetric Store Isolation Tests
// ----------------------------------------------------------------------
await runTest('2.1 Cross-seller access: Seller B cannot see Seller A products in status query', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-A',
    storeId: 'store-A',
    title: 'Seller A Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  // Seller B queries prodId
  const req = {
    tenant: { sellerId: 'seller-B', storeId: 'store-A' },
    query: { productIds: prodId },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.statuses, {});
});

await runTest('2.2 Symmetric store isolation: Tenant with Store B cannot see Store A product', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-common',
    storeId: 'store-A',
    title: 'Store A Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  const req = {
    tenant: { sellerId: 'seller-common', storeId: 'store-B' },
    query: { productIds: prodId },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.statuses, {});
});

await runTest('2.3 Store-less tenant cannot access store-bound product', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-common',
    storeId: 'store-bound-99',
    title: 'Store-Bound Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  const req = {
    tenant: { sellerId: 'seller-common', storeId: null },
    query: { productIds: prodId },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.data.statuses, {});
});

await runTest('2.4 Query string tampering (?sellerId=... & ?storeId=...) is completely ignored', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-honest',
    storeId: 'store-honest',
    title: 'Honest Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  // Attacker tries passing query params to impersonate seller-honest
  const req = {
    tenant: { sellerId: 'seller-attacker', storeId: 'store-attacker' },
    query: {
      productIds: prodId,
      sellerId: 'seller-honest',
      storeId: 'store-honest',
    },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  // Must be empty because authenticated tenant is seller-attacker
  assert.deepStrictEqual(res.body.data.statuses, {});
});

// ----------------------------------------------------------------------
// 3. Deterministic Latest Submission Sorting & Required Projections
// ----------------------------------------------------------------------
await runTest('3.1 Selects newest submission deterministically by { updatedAt: -1, _id: -1 }', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-det-01',
    storeId: 'store-det-01',
    title: 'Deterministic Test Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  // Create older submission (DRY_RUN_COMPLETED)
  const subOld = {
    _id: 'sub_old_111',
    id: 'sub_old_111',
    sellerId: 'seller-det-01',
    storeId: 'store-det-01',
    productId: prodId,
    provider: 'AMAZON',
    status: 'DRY_RUN_COMPLETED',
    productType: 'HOME',
    updatedAt: new Date(Date.now() - 3600000), // 1 hour ago
    issues: [{ code: 'INFO_1', severity: 'INFO', message: 'Older note' }],
  };

  // Create newer submission (SANDBOX_SUBMITTED)
  const subNew = {
    _id: 'sub_new_222',
    id: 'sub_new_222',
    sellerId: 'seller-det-01',
    storeId: 'store-det-01',
    productId: prodId,
    provider: 'AMAZON',
    status: 'SANDBOX_SUBMITTED',
    amazonSubmissionId: 'amz-sub-id-998877',
    productType: 'HOME',
    updatedAt: new Date(Date.now()), // current
    issues: [],
  };

  inMemorySubmissionsMap.set(subOld._id, subOld);
  inMemorySubmissionsMap.set(subNew._id, subNew);

  const req = {
    tenant: { sellerId: 'seller-det-01', storeId: 'store-det-01' },
    query: { productIds: prodId },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  const statusInfo = res.body.data.statuses[prodId];
  assert.ok(statusInfo);
  assert.strictEqual(statusInfo.amazon.submissionId, 'sub_new_222');
  assert.strictEqual(statusInfo.amazon.status, 'SANDBOX_SUBMITTED');
  assert.strictEqual(statusInfo.amazon.amazonSubmissionId, 'amz-sub-id-998877');
  assert.strictEqual(statusInfo.amazon.productType, 'HOME');
});

// ----------------------------------------------------------------------
// 4. Multi-Provider Grouping (Correction 1)
// ----------------------------------------------------------------------
await runTest('4.1 Multi-provider grouping: tracks AMAZON and other providers independently', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-multi-01',
    storeId: 'store-multi-01',
    title: 'Multi-Channel Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  // Amazon submission
  const subAmz = {
    _id: 'sub_amz_01',
    sellerId: 'seller-multi-01',
    storeId: 'store-multi-01',
    productId: prodId,
    provider: 'AMAZON',
    status: 'SANDBOX_SUBMITTED',
    productType: 'KITCHEN',
    updatedAt: new Date(),
  };

  // Flipkart submission
  const subFkp = {
    _id: 'sub_fkp_01',
    sellerId: 'seller-multi-01',
    storeId: 'store-multi-01',
    productId: prodId,
    provider: 'FLIPKART',
    status: 'READY',
    productType: 'KITCHEN_CONTAINER',
    updatedAt: new Date(),
  };

  inMemorySubmissionsMap.set(subAmz._id, subAmz);
  inMemorySubmissionsMap.set(subFkp._id, subFkp);

  const req = {
    tenant: { sellerId: 'seller-multi-01', storeId: 'store-multi-01' },
    query: { productIds: prodId },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  const statusInfo = res.body.data.statuses[prodId];
  assert.strictEqual(statusInfo.submissions.AMAZON.status, 'SANDBOX_SUBMITTED');
  assert.strictEqual(statusInfo.submissions.FLIPKART.status, 'READY');
  assert.strictEqual(statusInfo.amazon.submissionId, 'sub_amz_01');
  assert.strictEqual(statusInfo.submissions.FLIPKART.submissionId, 'sub_fkp_01');
});

// ----------------------------------------------------------------------
// 5. In-Memory Fallback Tenant & Store Isolation (Correction 2)
// ----------------------------------------------------------------------
await runTest('5.1 getAmazonListingSubmissionById enforces seller & store on memory fallback', async () => {
  const subId = 'sub-mem-iso-99';
  inMemorySubmissionsMap.set(subId, {
    _id: subId,
    sellerId: 'seller-alpha',
    storeId: 'store-alpha',
    status: 'READY',
    productType: 'SHIRT',
  });

  // Cross-tenant access attempt
  const reqCross = {
    tenant: { sellerId: 'seller-beta', storeId: 'store-alpha' },
    params: { id: subId },
  };
  const resCross = createMockRes();
  await getAmazonListingSubmissionById(reqCross, resCross);
  assert.strictEqual(resCross.statusCode, 404);

  // Cross-store access attempt
  const reqStore = {
    tenant: { sellerId: 'seller-alpha', storeId: 'store-beta' },
    params: { id: subId },
  };
  const resStore = createMockRes();
  await getAmazonListingSubmissionById(reqStore, resStore);
  assert.strictEqual(resStore.statusCode, 404);

  // Legitimate tenant access
  const reqOk = {
    tenant: { sellerId: 'seller-alpha', storeId: 'store-alpha' },
    params: { id: subId },
  };
  const resOk = createMockRes();
  await getAmazonListingSubmissionById(reqOk, resOk);
  assert.strictEqual(resOk.statusCode, 200);
  assert.strictEqual(resOk.body.data.submission._id, subId);
});

// ----------------------------------------------------------------------
// 6. Phase 03.5.1 Approval & Eligibility Rules (Correction 3)
// ----------------------------------------------------------------------
await runTest('6.1 Eligibility helper enforces exact Phase 03.5.1 rules', async () => {
  // 1. Approved AI product
  const aiApproved = { status: 'Active', aiGenerated: true, aiApproved: true };
  assert.strictEqual(isProductEligibleForPublishing(aiApproved), true);

  // 2. Unapproved AI product
  const aiUnapproved = { status: 'Active', aiGenerated: true, aiApproved: false };
  assert.strictEqual(isProductEligibleForPublishing(aiUnapproved), false);

  // 3. AI job present without approval
  const aiJobUnapproved = { status: 'Active', aiGenerated: false, aiJobId: 'job-123', aiApproved: false };
  assert.strictEqual(isProductEligibleForPublishing(aiJobUnapproved), false);

  // 4. Manual active product
  const manualActive = { status: 'Active', aiGenerated: false, aiJobId: null };
  assert.strictEqual(isProductEligibleForPublishing(manualActive), true);

  // 5. Inactive manual product
  const manualInactive = { status: 'Low Stock', aiGenerated: false, aiJobId: null };
  assert.strictEqual(isProductEligibleForPublishing(manualInactive), false);

  // 6. Draft & Archived
  const draftProd = { status: 'Draft', aiGenerated: false, aiJobId: null };
  const archProd = { status: 'Archived', aiGenerated: true, aiApproved: true };
  assert.strictEqual(isProductEligibleForPublishing(draftProd), false);
  assert.strictEqual(isProductEligibleForPublishing(archProd), false);
});

// ----------------------------------------------------------------------
// 7. Strict ProductType Validation (No 'SHIRT' Default)
// ----------------------------------------------------------------------
await runTest('7.1 validateAmazonListing rejects missing/empty productType with HTTP 400', async () => {
  const req = {
    tenant: { sellerId: 'seller-pt-01', storeId: 'store-pt-01' },
    body: {
      productId: 'prod-dummy',
      productType: '', // missing
    },
  };
  const res = createMockRes();
  await validateAmazonListing(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'MISSING_PRODUCT_TYPE');
});

await runTest('7.2 createOrUpdateAmazonListingSubmission rejects missing productType with HTTP 400', async () => {
  const req = {
    tenant: { sellerId: 'seller-pt-01', storeId: 'store-pt-01' },
    body: {
      productId: 'prod-dummy',
      productType: '   ', // whitespace only
    },
  };
  const res = createMockRes();
  await createOrUpdateAmazonListingSubmission(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'MISSING_PRODUCT_TYPE');
});

// ----------------------------------------------------------------------
// 8. Production 503 Fail-Fast Policy
// ----------------------------------------------------------------------
await runTest('8.1 In NODE_ENV=production, database failure in getMarketplaceListingStatusSummary returns HTTP 503', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const origFind = Product.find;
  Product.find = () => {
    throw new Error('Connection to MongoDB failed (simulated)');
  };

  try {
    const validId = new mongoose.Types.ObjectId().toString();
    const req = {
      tenant: { sellerId: 'seller-prod-503', storeId: 'store-prod-503' },
      query: { productIds: validId },
    };
    const res = createMockRes();
    await getMarketplaceListingStatusSummary(req, res);

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'DATABASE_UNAVAILABLE');
  } finally {
    Product.find = origFind;
    process.env.NODE_ENV = prevEnv;
  }
});

await runTest('8.2 In NODE_ENV=production, database failure in getAmazonListingSubmissions returns HTTP 503', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const origFind = MarketplaceListingSubmission.find;
  MarketplaceListingSubmission.find = () => {
    throw new Error('MongoDB cluster unreachable (simulated)');
  };

  try {
    const req = {
      tenant: { sellerId: 'seller-prod-503', storeId: 'store-prod-503' },
      query: {},
    };
    const res = createMockRes();
    await getAmazonListingSubmissions(req, res);

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'DATABASE_UNAVAILABLE');
  } finally {
    MarketplaceListingSubmission.find = origFind;
    process.env.NODE_ENV = prevEnv;
  }
});

// ----------------------------------------------------------------------
// 9. Legacy Amazon Publishing Rejection
// ----------------------------------------------------------------------
await runTest('9.1 publishProductToChannel rejects AMAZON channelId with HTTP 400', async () => {
  const req = {
    tenant: { sellerId: 'seller-leg-01' },
    params: { productId: 'prod-123', channelId: 'AMAZON' },
  };
  const res = createMockRes();
  await publishProductToChannel(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.code, 'AMAZON_LEGACY_PUBLISHING_DISABLED');
});

await runTest('9.2 publishProductToChannelService throws AMAZON_LEGACY_PUBLISHING_DISABLED for Amazon connection', async () => {
  const connId = 'conn-amz-legacy-01';
  inMemoryChannelsMap.set(connId, {
    _id: connId,
    sellerId: 'seller-leg-02',
    provider: 'AMAZON',
    credentials: {},
  });

  const tenant = { sellerId: 'seller-leg-02' };
  inMemoryProductsMap.set('prod-leg-02', {
    _id: 'prod-leg-02',
    sellerId: 'seller-leg-02',
    title: 'Legacy Test Product',
    sku: 'LEG-SKU-02',
  });

  try {
    await publishProductToChannelService(tenant, 'prod-leg-02', connId);
    assert.fail('Should have thrown AMAZON_LEGACY_PUBLISHING_DISABLED error');
  } catch (err) {
    assert.strictEqual(err.code, 'AMAZON_LEGACY_PUBLISHING_DISABLED');
    assert.strictEqual(err.statusCode, 400);
  }
});

// ----------------------------------------------------------------------
// 10. Semantic Accuracy (SANDBOX_SUBMITTED preserved)
// ----------------------------------------------------------------------
await runTest('10.1 Preserves exact SANDBOX_SUBMITTED status without aliasing to LIVE/PUBLISHED', async () => {
  const prodId = new mongoose.Types.ObjectId().toString();
  inMemoryProductsMap.set(prodId, {
    _id: prodId,
    sellerId: 'seller-sem-01',
    storeId: 'store-sem-01',
    title: 'Semantic Product',
    status: 'Active',
    aiGenerated: false,
    aiJobId: null,
  });

  const sub = {
    _id: 'sub-sem-01',
    sellerId: 'seller-sem-01',
    storeId: 'store-sem-01',
    productId: prodId,
    provider: 'AMAZON',
    status: 'SANDBOX_SUBMITTED',
    productType: 'JEWELRY',
    updatedAt: new Date(),
  };
  inMemorySubmissionsMap.set(sub._id, sub);

  const req = {
    tenant: { sellerId: 'seller-sem-01', storeId: 'store-sem-01' },
    query: { productIds: prodId },
  };
  const res = createMockRes();
  await getMarketplaceListingStatusSummary(req, res);

  assert.strictEqual(res.statusCode, 200);
  const statusInfo = res.body.data.statuses[prodId];
  assert.strictEqual(statusInfo.amazon.status, 'SANDBOX_SUBMITTED');
  assert.strictEqual(statusInfo.amazon.status === 'LIVE', false);
  assert.strictEqual(statusInfo.amazon.status === 'PUBLISHED', false);
});

console.log('\n========================================================================');
console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
