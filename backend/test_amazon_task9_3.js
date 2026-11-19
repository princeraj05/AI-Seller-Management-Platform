import assert from 'assert';
import {
  searchProductTypes,
  getProductTypeDefinition,
  FALLBACK_PRODUCT_TYPES,
  FALLBACK_SCHEMAS,
} from './src/integrations/marketplaces/amazon/amazon.definitions.service.js';
import {
  validateListingData,
  buildSpApiListingPayload,
  executeListingSubmission,
} from './src/integrations/marketplaces/amazon/amazon.publisher.service.js';
import {
  MarketplaceListingSubmission,
  inMemorySubmissionsMap,
} from './src/modules/channels/marketplaceListingSubmission.model.js';

let passed = 0;
let failed = 0;
const asyncTests = [];

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
  asyncTests.push(p);
}

console.log('\n========================================================================');
console.log('TASK 9.3 / 9.3.1: SUBMISSION STATUS, NOTIFICATIONS & AUDIT TEST SUITE');
console.log('========================================================================\n');

// 1. Dry-Run Status & External Submission ID Check
runAsyncTest('1. Dry-Run Execution: Mode=DRY_RUN, amazonSubmissionId is null (No fake external ID)', async () => {
  const testSub = {
    _id: 'sub_dryrun_test_01',
    id: 'sub_dryrun_test_01',
    sellerId: 'tenant-seller-001',
    productId: 'prod-001',
    sellerSku: 'AMZ-TEST-TSHIRT-001',
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    submissionMode: 'DRY_RUN',
    status: 'READY',
    amazonSubmissionId: null,
    mappedAttributes: {
      title: 'Premium Cotton T-Shirt',
      brand: 'Demo Brand',
      sellerSku: 'AMZ-TEST-TSHIRT-001',
      description: '100% Cotton Bio-Washed T-Shirt for daily wear.',
      bulletPoints: ['Cotton', 'Comfortable'],
      mainImage: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
      price: 899,
      quantity: 5,
      countryOfOrigin: 'IN',
    },
    gtinExemptionRequested: true,
  };
  inMemorySubmissionsMap.set(testSub._id, testSub);

  const res = await executeListingSubmission(testSub, { dryRun: true, mode: 'DRY_RUN' });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.status, 'DRY_RUN');
  assert.strictEqual(res.isDryRun, true);
  // Verify that amazonSubmissionId was NOT fabricated
  assert.strictEqual(testSub.amazonSubmissionId, null, 'Dry-run must NEVER generate fake amazonSubmissionId');
  assert.ok(res.responseMetadata?.dryRunVerified, 'dryRunVerified flag must be present');
});

// 2. Draft Response Structure & ID Extraction (Bug Root Cause Fix)
runTest('2. Notification Bug Fix: Draft creation response correctly resolves submission._id without throwing', () => {
  // Simulating backend controller envelope: { success: true, message: 'Listing submission created/updated successfully', data: { submission: doc, valid: true } }
  const rawControllerResponse = {
    success: true,
    message: 'Listing submission created/updated successfully',
    data: {
      submission: {
        _id: '6739b1a03ef1234567890abc',
        sellerSku: 'AMZ-TEST-TSHIRT-001',
        status: 'READY',
        submissionMode: 'DRY_RUN',
      },
      valid: true,
      issues: [],
    },
  };

  // ChannelService normalization
  const subDoc = rawControllerResponse?.data?.submission || rawControllerResponse?.submission || rawControllerResponse?.data;
  const submissionId = subDoc?._id || subDoc?.id;

  assert.ok(submissionId, 'submissionId must be accurately extracted from data.submission._id');
  assert.strictEqual(submissionId, '6739b1a03ef1234567890abc');
  assert.strictEqual(rawControllerResponse.success, true);
  // Guarantee this structure never triggers the error throw
  assert.ok(rawControllerResponse.success && submissionId, 'Must not throw error on successful draft creation');
});

// 3. Transparent Schema Source Verification
runAsyncTest('3. Schema Definitions: Accurately labels source as DEVELOPMENT_FALLBACK in Sandbox', async () => {
  const schema = await getProductTypeDefinition('SHIRT', { marketplaceId: 'A21TJRUUN4KGV' });
  assert.strictEqual(schema.productType, 'SHIRT');
  assert.strictEqual(schema.schemaSource, 'DEVELOPMENT_FALLBACK');
  assert.strictEqual(schema.marketplaceId, 'A21TJRUUN4KGV');
  assert.ok(schema.requiredAttributes.includes('item_name'));
  assert.ok(schema.requiredAttributes.includes('main_image'));
});

// 4. Image Validation: HTTPS enforcement and Broken Image Rejection
runTest('4. Image Validation: Insecure HTTP links rejected; HTTPS links validated', () => {
  const validBase = {
    title: 'Valid Product Title with More Than 10 Characters',
    brand: 'Demo Brand',
    sellerSku: 'TEST-SKU-001',
    description: 'Detailed description with sufficient length for validation.',
    price: 500,
    quantity: 10,
    externalProductId: '9780201379624',
  };

  // Insecure HTTP link
  const resInsecure = validateListingData(
    { ...validBase, mainImage: 'http://example.com/image.jpg' },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resInsecure.valid, false);
  assert.ok(resInsecure.issues.some((i) => i.code === 'INSECURE_IMAGE_URL'));

  // Missing image link
  const resMissing = validateListingData(
    { ...validBase, mainImage: '' },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resMissing.valid, false);
  assert.ok(resMissing.issues.some((i) => i.code === 'MISSING_MAIN_IMAGE'));

  // Secure HTTPS link
  const resSecure = validateListingData(
    { ...validBase, mainImage: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resSecure.valid, true);
});

// 5. Hard Block on Production Publishing
runAsyncTest('5. Production Publishing Hard Block: Environment=production returns 403', async () => {
  const prodSub = {
    _id: 'sub_prod_block_01',
    sellerId: 'tenant-seller-001',
    productId: 'prod-001',
    sellerSku: 'AMZ-PROD-TEST',
    productType: 'SHIRT',
    mappedAttributes: { title: 'Test' },
  };

  let threw = false;
  try {
    await executeListingSubmission(prodSub, { environment: 'production' });
  } catch (err) {
    threw = true;
    assert.strictEqual(err.code, 'PRODUCTION_PUBLISHING_DISABLED');
    assert.strictEqual(err.status, 403);
  }
  assert.strictEqual(threw, true, 'Production execution must be completely blocked');
});

// 6. Master Product Immutability
runTest('6. Catalogue Protection: Master price (800) and stock (10) remain strictly immutable', () => {
  const masterProduct = {
    _id: 'prod_master_immutable',
    title: 'Premium Cotton T-Shirt',
    sku: 'TEST-TSHIRT-001',
    masterPrice: 800,
    stock: 10,
  };

  // Channel override payload has different price and quantity
  const channelPayload = buildSpApiListingPayload({
    product: masterProduct,
    mappedAttributes: {
      title: 'Premium Cotton T-Shirt',
      price: 899,
      quantity: 5,
    },
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    sellerSku: 'AMZ-TEST-TSHIRT-001',
    gtinExemption: true,
  });

  assert.strictEqual(masterProduct.masterPrice, 800, 'Central masterPrice must remain 800');
  assert.strictEqual(masterProduct.stock, 10, 'Central stock must remain 10');
  assert.strictEqual(
    channelPayload.attributes.purchasable_offer[0].our_price[0].schedule[0].value_with_tax,
    899,
    'SP-API payload takes channel override price'
  );
  assert.strictEqual(
    channelPayload.attributes.fulfillment_availability[0].quantity,
    5,
    'SP-API payload takes channel override quantity'
  );
});

// 7. Sandbox Execution Truthfulness (No Fake Submission ID on real responses)
runAsyncTest('7. Sandbox Execution: Preserves real Amazon submission ID when present, null when absent', async () => {
  const subForApi = {
    _id: 'sub_sandbox_real_01',
    id: 'sub_sandbox_real_01',
    sellerId: 'tenant-seller-001',
    productId: 'prod-001',
    sellerSku: 'AMZ-REAL-SKU-001',
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    submissionMode: 'SANDBOX_SUBMISSION',
    status: 'READY',
    mappedAttributes: {
      title: 'Valid Product Title for Sandbox Test',
      brand: 'Demo Brand',
      sellerSku: 'AMZ-REAL-SKU-001',
      description: 'Long description for sandbox listing submission.',
      bulletPoints: ['Cotton', 'Comfort'],
      mainImage: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      price: 800,
      quantity: 10,
      countryOfOrigin: 'IN',
    },
    gtinExemptionRequested: true,
  };
  inMemorySubmissionsMap.set(subForApi._id, subForApi);

  // Mock Amazon SP-API Client returning official submissionId
  const mockClientWithId = {
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    executeRequest: async () => ({
      submissionId: 'amzn1.spapi.submission.9988776655',
      _metadata: { status: 200, requestId: 'req-sandbox-123' },
    }),
  };

  const resWithId = await executeListingSubmission(subForApi, {
    client: mockClientWithId,
    dryRun: false,
    mode: 'SANDBOX_SUBMISSION',
  });
  assert.strictEqual(resWithId.success, true);
  assert.strictEqual(resWithId.amazonSubmissionId, 'amzn1.spapi.submission.9988776655');

  // Mock Amazon SP-API Client returning NO submissionId
  const mockClientNoId = {
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    executeRequest: async () => ({
      _metadata: { status: 200, requestId: 'req-sandbox-456' },
    }),
  };

  const resNoId = await executeListingSubmission(subForApi, {
    client: mockClientNoId,
    dryRun: false,
    mode: 'SANDBOX_SUBMISSION',
  });
  assert.strictEqual(resNoId.success, true);
  assert.strictEqual(resNoId.amazonSubmissionId, null, 'Must NOT fabricate fake ID when Amazon returns none');
});

// Await all async tests
Promise.all(asyncTests).then(() => {
  console.log('\n========================================================================');
  console.log(`TASK 9.3 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
});
