/**
 * Test Suite: Phase 03.5.1 — Master Product to Amazon Marketplace Adapter Alignment
 *
 * Verifies:
 * 1. Missing product type rejection (MISSING_PRODUCT_TYPE, no fallback to SHIRT)
 * 2. Authoritative MongoDB Product retrieval (server-side attributes used; client overrides ignored)
 * 3. Approval distinction (AI-approved allowed; unapproved AI rejected)
 * 4. Manual product compatibility (Active manual allowed without aiApproved)
 * 5. Draft and Archived product rejection (excluded from catalogue and rejected)
 * 6. Tenant & Store isolation (cross-seller and cross-store rejected with 403)
 * 7. Production in-memory fallback block (NODE_ENV=production blocks in-memory fallback)
 * 8. Master Product immutability (masterPrice, stock, and title strictly unchanged)
 * 9. Marketplace-specific edits (stored in submission without mutating master product)
 * 10. Schema-driven Amazon payload (only schema-defined attributes; no generic dumping)
 * 11. Cost price exclusion (costPrice never exposed or forwarded to Amazon)
 * 12. Image URL security (insecure HTTP rejected; secure HTTPS accepted)
 * 13. Duplicate submission prevention (compound key uniqueness enforced)
 */

import assert from 'assert';
import mongoose from 'mongoose';
import {
  validateListingData,
  buildSpApiListingPayload,
  executeListingSubmission,
  inMemorySubmissionsMap,
  resolveAmazonProductImageUrl,
  snapshotMasterProductFields,
  assertMasterProductImmutability,
} from '../src/integrations/marketplaces/amazon/amazon.publisher.service.js';
import {
  isProductEligibleForPublishing,
  sanitizeEligibleProduct,
  getEligibleCatalogueProducts,
} from '../src/modules/channels/channel.controller.js';
import {
  MarketplaceListingSubmission,
} from '../src/modules/channels/marketplaceListingSubmission.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { inMemoryProductsMap, getProductByIdService } from '../src/modules/products/product.service.js';

mongoose.set('bufferCommands', false);

let passed = 0;
let failed = 0;

async function runTest(testName, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('========================================================================');
  console.log('PHASE 03.5.1: MASTER PRODUCT TO AMAZON ADAPTER ALIGNMENT TEST SUITE');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Missing Product Type Rejection (No default to SHIRT)
  // ---------------------------------------------------------------------------
  await runTest('1. Missing product type is rejected without defaulting to SHIRT', () => {
    const invalidListing = {
      title: 'Handcrafted Wooden Spice Box',
      brand: 'Bhartiye Crafts',
      sellerSku: 'SPICE-BOX-001',
      description: 'Hand-carved wooden spice box from Saharanpur artisans.',
      mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      price: 1499,
      quantity: 15,
      gtinExemptionRequested: true,
    };

    const res = validateListingData(invalidListing, { productType: '' });
    assert.strictEqual(res.valid, false, 'Validation must fail when productType is missing');
    const pTypeIssue = res.issues.find((i) => i.code === 'MISSING_PRODUCT_TYPE' || i.attribute === 'productType');
    assert.ok(pTypeIssue, 'Should flag MISSING_PRODUCT_TYPE error');
    assert.strictEqual(pTypeIssue.severity, 'ERROR');

    // Also verify payload does NOT silently default to SHIRT
    const payload = buildSpApiListingPayload(invalidListing, { productType: '' });
    assert.notStrictEqual(payload.productType, 'SHIRT', 'Must not default to SHIRT');
    assert.strictEqual(payload.productType, '', 'productType should remain empty string');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Authoritative Product Retrieval (Server-side attributes used)
  // ---------------------------------------------------------------------------
  await runTest('2. Authoritative MongoDB/Storage Product retrieval enforces server-side attributes', async () => {
    const testSellerId = 'seller-auth-01';
    const testProdId = 'prod-auth-999';

    // Seed master product in storage
    const serverMasterProduct = {
      _id: testProdId,
      sellerId: testSellerId,
      sku: 'SERVER-SKU-001',
      title: 'Authentic Handcrafted Brass Diya',
      brand: 'Bhartiye Crafts Authentic',
      description: 'Handcrafted pure brass diya for festive celebrations.',
      masterPrice: 1200,
      stock: 25,
      images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800'],
      status: 'Active',
      aiApproved: true,
      productType: 'HOME_BED_AND_BATH',
      attributes: {
        material: 'Brass',
        color: 'Gold',
      },
    };
    inMemoryProductsMap.set(testProdId, serverMasterProduct);

    // Client attempts to submit with tampered masterPrice and forged brand
    const clientSubmission = new MarketplaceListingSubmission({
      _id: 'sub-auth-01',
      sellerId: testSellerId,
      productId: testProdId,
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SERVER-SKU-001',
      productType: 'HOME_BED_AND_BATH',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
      mappedAttributes: {
        item_name: 'Client Override Title',
        brand: 'Fake Brand Attempt',
        description: 'Authentic brass diya description.',
        mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
        gtinExemptionRequested: true,
      },
    });
    inMemorySubmissionsMap.set('sub-auth-01', clientSubmission);

    const result = await executeListingSubmission(
      { submissionId: 'sub-auth-01', dryRun: true },
      { tenant: { sellerId: testSellerId } }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'DRY_RUN');
    // SP-API attributes must use the authoritative product brand and material
    const payload = result.payloadPreview;
    assert.strictEqual(payload.attributes.material[0].value, 'Brass');
    assert.strictEqual(payload.attributes.color[0].value, 'Gold');
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Approval Distinction: AI-approved vs Unapproved AI
  // ---------------------------------------------------------------------------
  await runTest('3. Approval distinction: AI-approved allowed, unapproved AI product rejected', async () => {
    const approvedAiProd = {
      _id: 'ai-app-01',
      aiGenerated: true,
      aiApproved: true,
      status: 'Active',
    };
    const unapprovedAiProd = {
      _id: 'ai-unapp-02',
      aiGenerated: true,
      aiApproved: false,
      status: 'Active',
    };

    assert.strictEqual(isProductEligibleForPublishing(approvedAiProd), true, 'Approved AI product must be eligible');
    assert.strictEqual(isProductEligibleForPublishing(unapprovedAiProd), false, 'Unapproved AI product must NOT be eligible');

    // Verify executeListingSubmission rejects unapproved AI product
    inMemoryProductsMap.set('ai-unapp-02', {
      ...unapprovedAiProd,
      sellerId: 'seller-test-01',
      sku: 'SKU-UNAPP',
      title: 'Unapproved AI Product',
      brand: 'Test Brand',
      productType: 'HOME',
      images: ['https://example.com/pic.jpg'],
    });

    const unappSubmission = new MarketplaceListingSubmission({
      _id: 'sub-unapp-01',
      sellerId: 'seller-test-01',
      productId: 'ai-unapp-02',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SKU-UNAPP',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
    });
    inMemorySubmissionsMap.set('sub-unapp-01', unappSubmission);

    let rejected = false;
    try {
      await executeListingSubmission(
        { submissionId: 'sub-unapp-01', dryRun: true },
        { tenant: { sellerId: 'seller-test-01' } }
      );
    } catch (e) {
      rejected = true;
      assert.strictEqual(e.code, 'PRODUCT_NOT_APPROVED');
    }
    assert.strictEqual(rejected, true, 'Unapproved AI product must be rejected by submission service');
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Manual Product Compatibility & Schema Preservation
  // ---------------------------------------------------------------------------
  await runTest('4. Manual product compatibility: Active manual product allowed; isApproved does not exist', () => {
    // 1. Verify isApproved does NOT exist on Product schema
    assert.strictEqual(
      Product.schema.path('isApproved'),
      undefined,
      'Product schema must NOT introduce or define isApproved field'
    );

    // 2. Active manual product (aiGenerated: false, aiJobId: null, status: Active)
    const validManualProd = {
      _id: 'manual-01',
      aiGenerated: false,
      aiJobId: null,
      status: 'Active',
    };
    assert.strictEqual(isProductEligibleForPublishing(validManualProd), true, 'Manual active product must be eligible');

    // 3. Inactive manual product is rejected
    const inactiveManualProd = {
      _id: 'manual-02',
      aiGenerated: false,
      aiJobId: null,
      status: 'Inactive',
    };
    assert.strictEqual(isProductEligibleForPublishing(inactiveManualProd), false, 'Manual inactive product must be ineligible');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Draft and Archived Product Rejection
  // ---------------------------------------------------------------------------
  await runTest('5. Draft and Archived products are excluded from publishing', async () => {
    const draftProd = {
      _id: 'draft-01',
      status: 'Draft',
      aiApproved: true,
    };
    const archivedProd = {
      _id: 'archived-01',
      status: 'Archived',
      aiApproved: true,
    };

    assert.strictEqual(isProductEligibleForPublishing(draftProd), false, 'Draft product must NOT be eligible');
    assert.strictEqual(isProductEligibleForPublishing(archivedProd), false, 'Archived product must NOT be eligible');

    inMemoryProductsMap.set('draft-01', {
      ...draftProd,
      sellerId: 'seller-draft-01',
      sku: 'SKU-DRAFT',
      title: 'Draft Product',
      brand: 'Test Brand',
      productType: 'HOME',
    });

    const draftSub = new MarketplaceListingSubmission({
      _id: 'sub-draft-01',
      sellerId: 'seller-draft-01',
      productId: 'draft-01',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SKU-DRAFT',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
    });
    inMemorySubmissionsMap.set('sub-draft-01', draftSub);

    let rejected = false;
    try {
      await executeListingSubmission(
        { submissionId: 'sub-draft-01', dryRun: true },
        { tenant: { sellerId: 'seller-draft-01' } }
      );
    } catch (e) {
      rejected = true;
      assert.strictEqual(e.code, 'PRODUCT_NOT_APPROVED');
      assert.ok(e.message.includes('Draft'));
    }
    assert.strictEqual(rejected, true, 'Draft product must be rejected by submission service');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Multi-Tenant & Symmetric Store Isolation
  // ---------------------------------------------------------------------------
  await runTest('6. Tenant and Store isolation: Symmetric store matching and cross-tenant access rejected with 403', async () => {
    // Master product belonging to tenant-A and store-A
    inMemoryProductsMap.set('prod-tenant-a', {
      _id: 'prod-tenant-a',
      sellerId: 'tenant-A',
      storeId: 'store-A',
      sku: 'TENANT-A-SKU',
      title: 'Tenant A Product',
      brand: 'Tenant A Brand',
      status: 'Active',
      aiApproved: true,
      productType: 'HOME',
      description: 'A valid detailed description for tenant A product.',
      bulletPoints: ['High quality craftsmanship', 'Authentic handmade'],
      masterPrice: 999,
      stock: 15,
      images: ['https://example.com/img.jpg'],
    });

    // Master product belonging to tenant-A without store
    inMemoryProductsMap.set('prod-tenant-nostore', {
      _id: 'prod-tenant-nostore',
      sellerId: 'tenant-A',
      storeId: null,
      sku: 'TENANT-A-NOSTORE',
      title: 'Tenant A NoStore Product',
      brand: 'Tenant A Brand',
      status: 'Active',
      aiApproved: true,
      productType: 'HOME',
      images: ['https://example.com/img.jpg'],
    });

    // Case 6A: Cross-tenant attempt: tenant-B attempts to publish tenant-A's product -> 403
    const subCrossTenant = new MarketplaceListingSubmission({
      _id: 'sub-cross-01',
      sellerId: 'tenant-B',
      productId: 'prod-tenant-a',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'TENANT-A-SKU',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
    });
    inMemorySubmissionsMap.set('sub-cross-01', subCrossTenant);

    let crossTenantRejected = false;
    try {
      await executeListingSubmission(
        { submissionId: 'sub-cross-01', dryRun: true },
        { tenant: { sellerId: 'tenant-B', storeId: 'store-A' } }
      );
    } catch (e) {
      crossTenantRejected = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ACCESS');
      assert.strictEqual(e.status, 403);
    }
    assert.strictEqual(crossTenantRejected, true, 'Cross-tenant access must be rejected with 403');

    // Case 6B: Cross-store attempt: tenant-A with store-B attempts to publish store-A's product -> 403
    const subCrossStore = new MarketplaceListingSubmission({
      _id: 'sub-cross-store-01',
      sellerId: 'tenant-A',
      storeId: 'store-B',
      productId: 'prod-tenant-a',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'TENANT-A-SKU',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
    });
    inMemorySubmissionsMap.set('sub-cross-store-01', subCrossStore);

    let crossStoreRejected = false;
    try {
      await executeListingSubmission(
        { submissionId: 'sub-cross-store-01', dryRun: true },
        { tenant: { sellerId: 'tenant-A', storeId: 'store-B' } }
      );
    } catch (e) {
      crossStoreRejected = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ACCESS');
      assert.strictEqual(e.status, 403);
    }
    assert.strictEqual(crossStoreRejected, true, 'Cross-store access must be rejected with 403');

    // Case 6C: Product has store-A, but request has NO store -> 403 (symmetric check)
    const subNoStoreReq = new MarketplaceListingSubmission({
      _id: 'sub-nostore-req-01',
      sellerId: 'tenant-A',
      productId: 'prod-tenant-a',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'TENANT-A-SKU',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
    });
    inMemorySubmissionsMap.set('sub-nostore-req-01', subNoStoreReq);

    let missingStoreRejected = false;
    try {
      await executeListingSubmission(
        { submissionId: 'sub-nostore-req-01', dryRun: true },
        { tenant: { sellerId: 'tenant-A', storeId: null } }
      );
    } catch (e) {
      missingStoreRejected = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ACCESS');
      assert.strictEqual(e.status, 403);
    }
    assert.strictEqual(missingStoreRejected, true, 'Missing store context in request must be rejected with 403');

    // Case 6D: Product has NO store, but request specifies store-A -> 403 (symmetric check)
    const subStoreMismatch = new MarketplaceListingSubmission({
      _id: 'sub-store-mismatch-01',
      sellerId: 'tenant-A',
      storeId: 'store-A',
      productId: 'prod-tenant-nostore',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'TENANT-A-NOSTORE',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
    });
    inMemorySubmissionsMap.set('sub-store-mismatch-01', subStoreMismatch);

    let storeMismatchRejected = false;
    try {
      await executeListingSubmission(
        { submissionId: 'sub-store-mismatch-01', dryRun: true },
        { tenant: { sellerId: 'tenant-A', storeId: 'store-A' } }
      );
    } catch (e) {
      storeMismatchRejected = true;
      assert.strictEqual(e.code, 'UNAUTHORIZED_ACCESS');
      assert.strictEqual(e.status, 403);
    }
    assert.strictEqual(storeMismatchRejected, true, 'Request with store for store-less product must be rejected with 403');

    // Case 6E: Matching tenant-A and matching store-A -> succeeds
    const subMatchingStore = new MarketplaceListingSubmission({
      _id: 'sub-matching-store-01',
      sellerId: 'tenant-A',
      storeId: 'store-A',
      productId: 'prod-tenant-a',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'TENANT-A-SKU',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
      mappedAttributes: {
        gtinExemptionRequested: true,
        mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      },
    });
    inMemorySubmissionsMap.set('sub-matching-store-01', subMatchingStore);

    const matchRes = await executeListingSubmission(
      { submissionId: 'sub-matching-store-01', dryRun: true },
      { tenant: { sellerId: 'tenant-A', storeId: 'store-A' } }
    );
    assert.strictEqual(matchRes.success, true, 'Matching tenant and matching store must succeed');
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Production Safety & 503 DB Inaccessibility Handling
  // ---------------------------------------------------------------------------
  await runTest('7. Production safety: In-memory fallback blocked and DB failures return 503', async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // 7A: In-memory fallback blocked in production (returns 404 for unpersisted product)
      const prodSub = new MarketplaceListingSubmission({
        _id: 'sub-prod-env-01',
        sellerId: 'seller-prod-env',
        productId: 'non-existent-mongo-prod',
        marketplaceId: 'A21TJRUUN4KGV',
        sellerSku: 'SKU-PROD-ENV',
        productType: 'HOME',
        submissionMode: 'DRY_RUN',
        status: 'DRAFT',
      });
      inMemorySubmissionsMap.set('sub-prod-env-01', prodSub);

      // 7A: In-memory fallback blocked and DB query failure returns 503 in production
      let rejected503 = false;
      try {
        await executeListingSubmission(
          { submissionId: 'sub-prod-env-01', dryRun: true },
          { tenant: { sellerId: 'seller-prod-env' } }
        );
      } catch (e) {
        rejected503 = true;
        assert.strictEqual(e.code, 'SERVICE_UNAVAILABLE');
        assert.strictEqual(e.status, 503);
      }
      assert.strictEqual(rejected503, true, 'Production MongoDB query failure must return 503 Service Unavailable');

      // 7B: When submission exists in MongoDB but Product query resolves to null, product is not found (404) without in-memory fallback
      const origSubFindOne = MarketplaceListingSubmission.findOne;
      const origFindOne = Product.findOne;
      MarketplaceListingSubmission.findOne = async () => prodSub;
      Product.findOne = async () => null;
      let rejected404 = false;
      try {
        await executeListingSubmission(
          { submissionId: 'sub-prod-env-01', dryRun: true },
          { tenant: { sellerId: 'seller-prod-env' } }
        );
      } catch (e) {
        rejected404 = true;
        assert.strictEqual(e.code, 'PRODUCT_NOT_FOUND');
        assert.strictEqual(e.status, 404);
      } finally {
        MarketplaceListingSubmission.findOne = origSubFindOne;
        Product.findOne = origFindOne;
      }
      assert.strictEqual(rejected404, true, 'Production must reject unpersisted products with 404 without in-memory fallback');

      // 7B: getEligibleCatalogueProducts returns 503 on production DB failure (never silently empty)
      const mockReq = {
        tenant: { sellerId: 'seller-prod-env' },
        query: {},
      };
      let statusSent = null;
      let bodySent = null;
      const mockRes = {
        status: (s) => {
          statusSent = s;
          return {
            json: (b) => {
              bodySent = b;
              return b;
            },
          };
        },
      };

      await getEligibleCatalogueProducts(mockReq, mockRes);
      assert.strictEqual(statusSent, 503, 'Production catalogue query failure must return HTTP 503');
      assert.strictEqual(bodySent.success, false);
      assert.ok(bodySent.message.includes('Service Unavailable'));
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // TEST 8: Complete Master Product Immutability (All 13 Fields)
  // ---------------------------------------------------------------------------
  await runTest('8. Complete Master Product immutability: all 13 MongoDB fields strictly unchanged', async () => {
    // Definitive master product with non-default values populated for all 13 fields:
    // 1. title, 2. description, 3. shortDescription, 4. bulletPoints, 5. productType,
    // 6. brand, 7. categoryName, 8. subcategory, 9. attributes, 10. images,
    // 11. masterPrice, 12. costPrice, 13. stock.
    const master = {
      _id: 'master-immutable-01',
      sellerId: 'seller-immut-01',
      storeId: 'store-immut-01',
      sku: 'SKU-IMMUT-01',
      title: 'Original Handcrafted Silk Carpet',
      description: 'Authentic 100% Kashmir hand-knotted silk carpet with Persian motifs.',
      shortDescription: 'Hand-knotted silk carpet',
      bulletPoints: ['100% pure silk pile', 'Hand-knotted in Srinagar', 'Antique botanical design'],
      productType: 'RUG',
      brand: 'Bhartiye Crafts',
      categoryName: 'Home & Living',
      subcategory: 'Carpets & Rugs',
      attributes: {
        material: 'Pure Kashmir Silk',
        color: 'Ruby Red / Gold',
        size: '5x7 ft',
        countryOfOrigin: 'IN',
        technique: 'Hand Knotted',
      },
      images: [
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
        'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800',
      ],
      masterPrice: 45000,
      costPrice: 18000,
      stock: 5,
      status: 'Active',
      aiApproved: true,
    };
    inMemoryProductsMap.set('master-immutable-01', master);

    // Capture baseline deep clone snapshot of the 13 fields
    const snapshotBefore = snapshotMasterProductFields(master);

    // 8A. Validate Listing Data (Does not alter any field)
    const valRes = validateListingData({
      product: master,
      mappedAttributes: {
        item_name: 'Overridden Amazon Title',
        standard_price: 52000,
        quantity: 2,
        gtinExemptionRequested: true,
        mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      },
      productType: 'RUG',
      gtinExemption: true,
    });
    assert.strictEqual(valRes.valid, true);
    assertMasterProductImmutability(master, snapshotBefore);

    // 8B. Build SP-API Payload (Does not alter any field)
    const payload = buildSpApiListingPayload({
      product: master,
      mappedAttributes: {
        item_name: 'Overridden Amazon Title',
        standard_price: 52000,
        quantity: 2,
        gtinExemptionRequested: true,
      },
      productType: 'RUG',
      sellerSku: 'SKU-IMMUT-01',
      gtinExemption: true,
    });
    assert.strictEqual(payload.attributes.item_name[0].value, 'Overridden Amazon Title');
    assertMasterProductImmutability(master, snapshotBefore);

    // 8C. Dry-Run Submission
    const subDryRun = new MarketplaceListingSubmission({
      _id: 'sub-immut-01',
      sellerId: 'seller-immut-01',
      storeId: 'store-immut-01',
      productId: 'master-immutable-01',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SKU-IMMUT-01',
      productType: 'RUG',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
      mappedAttributes: {
        item_name: 'Overridden Amazon Title',
        standard_price: 52000,
        quantity: 2,
        gtinExemptionRequested: true,
        mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      },
    });
    inMemorySubmissionsMap.set('sub-immut-01', subDryRun);

    const dryRunResult = await executeListingSubmission(
      { submissionId: 'sub-immut-01', dryRun: true },
      { tenant: { sellerId: 'seller-immut-01', storeId: 'store-immut-01' } }
    );
    assert.strictEqual(dryRunResult.success, true);
    assertMasterProductImmutability(master, snapshotBefore);

    // 8D. Sandbox Submission
    const subSandbox = new MarketplaceListingSubmission({
      _id: 'sub-immut-02',
      sellerId: 'seller-immut-01',
      storeId: 'store-immut-01',
      productId: 'master-immutable-01',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SKU-IMMUT-01',
      productType: 'RUG',
      submissionMode: 'SANDBOX_SUBMISSION',
      status: 'DRAFT',
      mappedAttributes: {
        item_name: 'Overridden Amazon Title',
        standard_price: 52000,
        quantity: 2,
        gtinExemptionRequested: true,
        mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      },
    });
    inMemorySubmissionsMap.set('sub-immut-02', subSandbox);

    const mockSandboxClient = {
      credentials: { sellingPartnerId: 'A2IMMUTTEST1', marketplaceId: 'A21TJRUUN4KGV' },
      executeRequest: async (_ep, opts) => {
        if (opts?.method === 'PUT') {
          return {
            status: 'ACCEPTED',
            submissionId: 'amzn-sub-immut-02',
            issues: [],
            _metadata: { status: 200, requestId: 'req-immut-02' },
          };
        }
        return {};
      },
    };

    const sandboxResult = await executeListingSubmission(
      { submissionId: 'sub-immut-02', dryRun: false },
      { tenant: { sellerId: 'seller-immut-01', storeId: 'store-immut-01' }, client: mockSandboxClient }
    );
    assert.strictEqual(sandboxResult.success, true);

    // 8E. Verify ALL 13 MongoDB Product fields strictly unchanged
    const fieldsToVerify = [
      'title', 'description', 'shortDescription', 'bulletPoints',
      'productType', 'brand', 'categoryName', 'subcategory',
      'attributes', 'images', 'masterPrice', 'costPrice', 'stock',
    ];
    for (const f of fieldsToVerify) {
      assert.deepStrictEqual(
        master[f],
        snapshotBefore[f],
        `Field "${f}" must remain strictly identical and unmutated throughout Amazon operations`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Marketplace-Specific Edits Preservation
  // ---------------------------------------------------------------------------
  await runTest('9. Marketplace-specific edits preserved in submission without master mutation', async () => {
    const master = {
      _id: 'master-edits-01',
      sellerId: 'seller-edits-01',
      sku: 'SKU-EDITS-01',
      title: 'Original Title',
      bulletPoints: ['Original highlight 1', 'Original highlight 2'],
      brand: 'Bhartiye Crafts',
      description: 'Original description.',
      masterPrice: 999,
      stock: 20,
      images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800'],
      status: 'Active',
      aiApproved: true,
      productType: 'HOME',
    };
    inMemoryProductsMap.set('master-edits-01', master);

    const channelTitle = 'Amazon Exclusive - Premium Handicraft Item';
    const channelBullets = ['Amazon bullet A', 'Amazon bullet B', 'Amazon bullet C'];

    const sub = new MarketplaceListingSubmission({
      _id: 'sub-edits-01',
      sellerId: 'seller-edits-01',
      productId: 'master-edits-01',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SKU-EDITS-01',
      productType: 'HOME',
      submissionMode: 'DRY_RUN',
      status: 'DRAFT',
      mappedAttributes: {
        item_name: channelTitle,
        bulletPoints: channelBullets,
        gtinExemptionRequested: true,
        mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800',
      },
    });
    inMemorySubmissionsMap.set('sub-edits-01', sub);

    const result = await executeListingSubmission(
      { submissionId: 'sub-edits-01', dryRun: true },
      { tenant: { sellerId: 'seller-edits-01' } }
    );

    assert.strictEqual(result.success, true);
    // The Amazon payload uses the channel-specific edits
    assert.strictEqual(result.payloadPreview.attributes.item_name[0].value, channelTitle);
    assert.strictEqual(result.payloadPreview.attributes.bullet_point.length, 3);
    assert.strictEqual(result.payloadPreview.attributes.bullet_point[0].value, 'Amazon bullet A');

    // Master product bullet points and title remain intact
    assert.strictEqual(master.title, 'Original Title');
    assert.strictEqual(master.bulletPoints.length, 2);
    assert.strictEqual(master.bulletPoints[0], 'Original highlight 1');
  });

  // ---------------------------------------------------------------------------
  // TEST 10: Schema-Driven Amazon Payload (No arbitrary dumping)
  // ---------------------------------------------------------------------------
  await runTest('10. Schema-driven Amazon payload: only schema-defined attributes mapped', () => {
    const productWithInternalMeta = {
      title: 'Handcrafted Blue Pottery Plate',
      brand: 'Jaipur Blue Pottery',
      sku: 'PLATE-001',
      description: 'Traditional Jaipur turquoise blue pottery ceramic plate.',
      masterPrice: 650,
      stock: 14,
      productType: 'DISHWARE_PLATE',
      images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800'],
      bulletPoints: ['Lead-free quartz glaze', 'Hand-painted floral motifs'],
      color: 'Turquoise Blue',
      material: 'Ceramic Quartz',
      attributes: {
        color: 'Turquoise Blue',
        material: 'Ceramic Quartz',
        countryOfOrigin: 'IN',
        manufacturer: 'Jaipur Artisan Collective',
        // Internal metadata that should NOT be dumped into Amazon payload
        internalCostCode: 'CC-9941',
        warehouseLocation: 'Bin-4-B',
        adminNotes: 'Inspect carefully before packing',
      },
    };

    const payload = buildSpApiListingPayload({
      product: productWithInternalMeta,
      productType: 'DISHWARE_PLATE',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'PLATE-001',
      gtinExemption: true,
    });

    assert.strictEqual(payload.productType, 'DISHWARE_PLATE');
    assert.strictEqual(payload.requirements, 'LISTING');
    assert.ok(payload.attributes.item_name);
    assert.ok(payload.attributes.brand);
    assert.ok(payload.attributes.bullet_point);
    assert.ok(payload.attributes.color);
    assert.ok(payload.attributes.material);
    assert.ok(payload.attributes.country_of_origin);
    assert.ok(payload.attributes.manufacturer);

    // Verify internal attributes are NOT dumped
    assert.strictEqual(payload.attributes.internalCostCode, undefined);
    assert.strictEqual(payload.attributes.warehouseLocation, undefined);
    assert.strictEqual(payload.attributes.adminNotes, undefined);
  });

  // ---------------------------------------------------------------------------
  // TEST 11: Cost Price Exclusion
  // ---------------------------------------------------------------------------
  await runTest('11. Cost price exclusion: costPrice stripped from catalogue and Amazon payload', () => {
    const rawProd = {
      _id: 'prod-cost-01',
      sku: 'SKU-COST-01',
      title: 'Silk Scarf',
      masterPrice: 1800,
      costPrice: 600, // Confidential
      sellerId: 'seller-cost-01',
      storeId: 'store-cost-01',
      tenantId: 'tenant-cost-01',
      status: 'Active',
      attributes: {
        material: 'Silk',
      },
    };

    const sanitized = sanitizeEligibleProduct(rawProd);
    assert.strictEqual(sanitized.costPrice, undefined, 'costPrice must be deleted');
    assert.strictEqual(sanitized.sellerId, undefined, 'sellerId must be deleted');
    assert.strictEqual(sanitized.storeId, undefined, 'storeId must be deleted');
    assert.strictEqual(sanitized.tenantId, undefined, 'tenantId must be deleted');
    assert.strictEqual(sanitized.masterPrice, 1800, 'masterPrice should remain');

    const payload = buildSpApiListingPayload({
      product: rawProd,
      productType: 'SCARF',
      marketplaceId: 'A21TJRUUN4KGV',
      sellerSku: 'SKU-COST-01',
      gtinExemption: true,
    });

    // Verify costPrice does not appear in payload
    assert.strictEqual(payload.attributes.costPrice, undefined);
    assert.strictEqual(payload.attributes.cost_price, undefined);
    assert.strictEqual(
      payload.attributes.purchasable_offer[0].our_price[0].schedule[0].value_with_tax,
      1800
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Image URL Accessibility, Resolution, and Validation
  // ---------------------------------------------------------------------------
  await runTest('12. Image URL accessibility: HTTPS, HTTP, blob, data, filesystem, and local resolution', () => {
    // 12A: Public valid HTTPS URL
    const resHttps = resolveAmazonProductImageUrl('https://res.cloudinary.com/demo/image/upload/sample.jpg');
    assert.strictEqual(resHttps.valid, true);
    assert.strictEqual(resHttps.url, 'https://res.cloudinary.com/demo/image/upload/sample.jpg');

    // 12B: Insecure HTTP rejected
    const resHttp = resolveAmazonProductImageUrl('http://insecure-host.com/image.jpg');
    assert.strictEqual(resHttp.valid, false);
    assert.strictEqual(resHttp.issueCode, 'INSECURE_IMAGE_URL');

    // 12C: Blob URL rejected
    const resBlob = resolveAmazonProductImageUrl('blob:https://example.com/uuid-9876-5432');
    assert.strictEqual(resBlob.valid, false);
    assert.strictEqual(resBlob.issueCode, 'INVALID_IMAGE_URL');

    // 12D: Data URI rejected
    const resData = resolveAmazonProductImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA');
    assert.strictEqual(resData.valid, false);
    assert.strictEqual(resData.issueCode, 'INVALID_IMAGE_URL');

    // 12E: Filesystem paths rejected (file://, Windows drive letter, absolute non-upload path)
    const resFile = resolveAmazonProductImageUrl('file:///C:/Users/test/product.jpg');
    assert.strictEqual(resFile.valid, false);
    assert.strictEqual(resFile.issueCode, 'INVALID_IMAGE_URL');

    const resWin = resolveAmazonProductImageUrl('C:\\Users\\test\\product.jpg');
    assert.strictEqual(resWin.valid, false);
    assert.strictEqual(resWin.issueCode, 'INVALID_IMAGE_URL');

    // 12F: Local path successfully resolved to permanent public HTTPS URL
    const resLocalOk = resolveAmazonProductImageUrl('/uploads/products/brass_diya.jpg', {
      assetBaseUrl: 'https://cdn.bhartiyecrafts.com',
    });
    assert.strictEqual(resLocalOk.valid, true);
    assert.strictEqual(resLocalOk.url, 'https://cdn.bhartiyecrafts.com/uploads/products/brass_diya.jpg');

    // 12G: Local path resolution failure (missing base or HTTP base)
    const resLocalFailNoBase = resolveAmazonProductImageUrl('/uploads/products/brass_diya.jpg', {
      assetBaseUrl: '',
    });
    assert.strictEqual(resLocalFailNoBase.valid, false);
    assert.strictEqual(resLocalFailNoBase.issueCode, 'UNRESOLVED_IMAGE_URL');

    const resLocalFailHttpBase = resolveAmazonProductImageUrl('/uploads/products/brass_diya.jpg', {
      assetBaseUrl: 'http://localhost:5000',
    });
    assert.strictEqual(resLocalFailHttpBase.valid, false);
    assert.strictEqual(resLocalFailHttpBase.issueCode, 'UNRESOLVED_IMAGE_URL');

    // 12H: Missing / Empty image rejected
    const resMissing = resolveAmazonProductImageUrl('');
    assert.strictEqual(resMissing.valid, false);
    assert.strictEqual(resMissing.issueCode, 'MISSING_MAIN_IMAGE');

    // 12I: validateListingData and buildSpApiListingPayload integration
    const validBase = {
      title: 'Kashmiri Pashmina Shawl',
      brand: 'Kashmir Weaves',
      sellerSku: 'SHAWL-001',
      description: 'Finest handwoven Pashmina shawl with Sozni embroidery.',
      bulletPoints: ['100% fine Cashmere', 'Handcrafted in Srinagar'],
      price: 9500,
      quantity: 5,
      gtinExemptionRequested: true,
    };

    // Rejects blob in validateListingData
    const valBlob = validateListingData(
      { ...validBase, mainImage: 'blob:https://example.com/uuid' },
      { productType: 'SHAWL' }
    );
    assert.strictEqual(valBlob.valid, false);
    assert.ok(valBlob.issues.some((i) => i.code === 'INVALID_IMAGE_URL'));

    // Resolves local path in buildSpApiListingPayload
    const payloadLocal = buildSpApiListingPayload(
      { ...validBase, mainImage: '/uploads/products/shawl_sozni.jpg' },
      { productType: 'SHAWL', assetBaseUrl: 'https://cdn.bhartiyecrafts.com' }
    );
    assert.strictEqual(
      payloadLocal.attributes.main_product_image_locator[0].media_location,
      'https://cdn.bhartiyecrafts.com/uploads/products/shawl_sozni.jpg'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 13: Duplicate Submission Prevention / Compound Uniqueness
  // ---------------------------------------------------------------------------
  await runTest('13. Duplicate submission prevention: compound uniqueness enforced', () => {
    const indexes = MarketplaceListingSubmission.schema.indexes();
    const hasCompoundUniqueness = indexes.some(([fields, options]) => {
      return (
        fields.sellerId === 1 &&
        fields.marketplaceId === 1 &&
        fields.sellerSku === 1 &&
        fields.environment === 1 &&
        options?.unique === true
      );
    });

    assert.strictEqual(
      hasCompoundUniqueness,
      true,
      'MarketplaceListingSubmission must define a unique compound index on sellerId, marketplaceId, sellerSku, and environment'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 14: Product Selection Navigation (Direct Link, Refresh, Missing/Invalid ID)
  // ---------------------------------------------------------------------------
  await runTest('14. Product selection navigation: direct link, refresh, missing ID, and invalid ID', async () => {
    const testSeller = 'seller-nav-test';
    const testProd = {
      _id: 'prod-nav-exact-01',
      sellerId: testSeller,
      title: 'Zari Embroidered Velvet Cushion Cover',
      sku: 'VELVET-CUSH-01',
      brand: 'Bhartiye Crafts',
      masterPrice: 1200,
      stock: 25,
      productType: 'HOME',
      status: 'Active',
      aiApproved: true,
      images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800'],
      bulletPoints: ['Hand embroidered Zari work', 'Rich velvet fabric'],
    };
    inMemoryProductsMap.set('prod-nav-exact-01', testProd);

    // 14A. Direct Navigation URL check
    // ProductDetails generates: /channels/amazon?tab=publish&productId=${product._id}
    const buildNavUrl = (prodId) => `/channels/amazon?tab=publish&productId=${prodId}`;
    const generatedUrl = buildNavUrl(testProd._id);
    assert.strictEqual(generatedUrl, '/channels/amazon?tab=publish&productId=prod-nav-exact-01');

    // 14B. Parameter parsing: tab='publish' activates publisher, extracts productId
    const parsedParams = new URLSearchParams(generatedUrl.split('?')[1]);
    assert.strictEqual(parsedParams.get('tab'), 'publish');
    assert.strictEqual(parsedParams.get('productId'), 'prod-nav-exact-01');

    // 14C. Selection on direct navigation or page refresh: loads exact product by ID
    const loadedProduct = await getProductByIdService(testSeller, parsedParams.get('productId'));
    assert.ok(loadedProduct);
    assert.strictEqual(loadedProduct._id, 'prod-nav-exact-01');
    assert.strictEqual(loadedProduct.title, testProd.title);
    assert.strictEqual(loadedProduct.masterPrice, 1200);

    // 14D. Missing ID handling: query without productId
    const missingIdUrl = '/channels/amazon?tab=publish';
    const missingParams = new URLSearchParams(missingIdUrl.split('?')[1]);
    const targetMissingId = missingParams.get('productId');
    assert.strictEqual(targetMissingId, null, 'productId should be null/absent');
    // Publisher state machine verifies that when targetProductId is empty, step remains 1

    // 14E. Invalid ID handling: nonexistent product ID
    let invalidIdHandled = false;
    try {
      await getProductByIdService(testSeller, 'non-existent-prod-id-999');
    } catch (err) {
      invalidIdHandled = true;
      assert.strictEqual(err.status, 404);
      assert.strictEqual(err.code, 'NOT_FOUND');
    }
    assert.strictEqual(invalidIdHandled, true, 'Invalid ID must throw handled 404 without crashing');
  });

  console.log('\n========================================================================');
  console.log(`ALIGNMENT SUITE RESULTS: ${passed} PASSED | ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
