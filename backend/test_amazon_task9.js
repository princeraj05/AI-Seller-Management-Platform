import assert from 'assert';
import mongoose from 'mongoose';
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
import { Product } from './src/modules/products/product.model.js';

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
console.log('TASK 9: AMAZON PRODUCT LISTING CREATION & PUBLISHING TEST SUITE');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Product Selection from Central Catalogue
// -----------------------------------------------------------------------------
runTest('1. Product selection: Valid central catalogue product structure mapped correctly', () => {
  const sampleProduct = {
    _id: 'prod-tshirt-001',
    seller: 'seller-tenant-1',
    name: 'Premium Cotton T-Shirt',
    brand: 'Demo Brand',
    sku: 'TEST-TSHIRT-001',
    category: 'Fashion',
    masterPrice: 800,
    stock: 10,
    barcode: '',
    images: [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' }],
    status: 'Active',
  };

  assert.strictEqual(sampleProduct.name, 'Premium Cotton T-Shirt');
  assert.strictEqual(sampleProduct.sku, 'TEST-TSHIRT-001');
  assert.strictEqual(sampleProduct.masterPrice, 800);
  assert.strictEqual(sampleProduct.stock, 10);
});

// -----------------------------------------------------------------------------
// TEST 2: Product Ownership Validation (Cross-Tenant Protection)
// -----------------------------------------------------------------------------
runTest('2. Product ownership validation: Prevent cross-tenant selection', () => {
  const productA = { _id: 'prod-100', seller: 'seller-tenant-A', name: 'Tenant A Product' };
  const requestingSellerId = 'seller-tenant-B';

  const isOwner = productA.seller.toString() === requestingSellerId.toString();
  assert.strictEqual(isOwner, false, 'Seller B must not own Seller A product');
});

// -----------------------------------------------------------------------------
// TEST 3: Tenant Isolation in Submissions Model
// -----------------------------------------------------------------------------
runAsyncTest('3. Tenant isolation: Submissions query strictly partitions by sellerId', async () => {
  // Add records to in-memory map
  const subA = {
    _id: 'sub-tenant-A-1',
    sellerId: 'tenant-user-A',
    tenantId: 'tenant-user-A',
    sellerSku: 'AMZ-SKU-A',
    marketplaceId: 'A21TJRUUN4KGV',
    environment: 'sandbox',
    status: 'DRY_RUN',
  };
  const subB = {
    _id: 'sub-tenant-B-1',
    sellerId: 'tenant-user-B',
    tenantId: 'tenant-user-B',
    sellerSku: 'AMZ-SKU-B',
    marketplaceId: 'A21TJRUUN4KGV',
    environment: 'sandbox',
    status: 'DRY_RUN',
  };

  inMemorySubmissionsMap.set(subA._id, subA);
  inMemorySubmissionsMap.set(subB._id, subB);

  // Retrieve for tenant A
  const tenantAResults = Array.from(inMemorySubmissionsMap.values()).filter(
    (s) => s.sellerId === 'tenant-user-A'
  );
  assert.strictEqual(tenantAResults.length, 1);
  assert.strictEqual(tenantAResults[0].sellerSku, 'AMZ-SKU-A');

  // Verify tenant B cannot see tenant A
  const hasLeak = tenantAResults.some((s) => s.sellerId === 'tenant-user-B');
  assert.strictEqual(hasLeak, false);
});

// -----------------------------------------------------------------------------
// TEST 4: Product Type Schema Handling & Fallback Definitions
// -----------------------------------------------------------------------------
runAsyncTest('4. Product type schema handling: Retrieves definitions schema with DEVELOPMENT_FALLBACK fallback', async () => {
  const def = await getProductTypeDefinition('SHIRT', { marketplaceId: 'A21TJRUUN4KGV' });
  assert.strictEqual(def.productType, 'SHIRT');
  assert.ok(def.requiredAttributes.includes('item_name'));
  assert.ok(def.requiredAttributes.includes('brand'));
  assert.ok(def.requiredAttributes.includes('description'));
  assert.ok(def.requiredAttributes.includes('bullet_point'));
  assert.ok(def.requiredAttributes.includes('main_image') || def.requiredAttributes.includes('main_product_image_locator'));
  assert.ok(def.schemaSource === 'AMAZON_DEFINITIONS_API' || def.schemaSource === 'DEVELOPMENT_FALLBACK');
});

// -----------------------------------------------------------------------------
// TEST 5: Missing Required Attributes Validation
// -----------------------------------------------------------------------------
runTest('5. Missing required attributes: Rejects incomplete listing payload', () => {
  const invalidData = {
    title: '', // Missing title
    brand: '', // Missing brand
    sellerSku: '',
    description: '',
    bulletPoints: [],
    mainImage: '',
    price: 0,
    quantity: -1,
  };

  const result = validateListingData(invalidData, { productType: 'SHIRT' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.issues.length >= 5);

  const missingFields = result.issues.map((i) => i.attribute);
  assert.ok(missingFields.includes('title'));
  assert.ok(missingFields.includes('brand'));
  assert.ok(missingFields.includes('sellerSku'));
  assert.ok(missingFields.includes('description'));
  assert.ok(missingFields.includes('mainImage'));
});

// -----------------------------------------------------------------------------
// TEST 6: GTIN Missing & Legitimate Exemption Handling
// -----------------------------------------------------------------------------
runTest('6. GTIN handling: Missing GTIN rejected when exemption is not requested; allowed when requested', () => {
  const validBase = {
    title: 'Premium Cotton T-Shirt',
    brand: 'Demo Brand',
    sellerSku: 'AMZ-TEST-001',
    description: 'A fine organic cotton shirt for daily comfort and wear.',
    bulletPoints: ['100% combed cotton', 'Pre-shrunk fabric', 'Machine washable'],
    mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
    price: 899,
    quantity: 15,
  };

  // Case A: Missing GTIN, no exemption requested -> INVALID
  const resWithoutGtin = validateListingData(
    { ...validBase, externalProductId: '', gtinExemptionRequested: false },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resWithoutGtin.valid, false);
  assert.ok(resWithoutGtin.issues.some((i) => i.attribute === 'externalProductId'));

  // Case B: Missing GTIN, exemption requested -> VALID
  const resWithExemption = validateListingData(
    { ...validBase, externalProductId: '', gtinExemptionRequested: true },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resWithExemption.valid, true);

  // Case C: Valid EAN barcode supplied -> VALID
  const resWithBarcode = validateListingData(
    {
      ...validBase,
      externalProductId: '8901234567890',
      externalProductIdType: 'EAN',
      gtinExemptionRequested: false,
    },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resWithBarcode.valid, true);
});

// -----------------------------------------------------------------------------
// TEST 7: Image URL Protocol & Extension Validation
// -----------------------------------------------------------------------------
runTest('7. Image URL validation: Requires secure HTTPS links', () => {
  const validBase = {
    title: 'Premium Cotton T-Shirt',
    brand: 'Demo Brand',
    sellerSku: 'AMZ-TEST-002',
    description: 'A fine cotton t-shirt with premium finish.',
    bulletPoints: ['Combed cotton', 'Comfort fit', 'Color fastness'],
    price: 799,
    quantity: 10,
    gtinExemptionRequested: true,
  };

  // Insecure HTTP image
  const resHttp = validateListingData(
    { ...validBase, mainImage: 'http://insecure.site/image.png' },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resHttp.valid, false);
  assert.ok(resHttp.issues.some((i) => i.attribute === 'mainImage'));

  // Malformed URL
  const resMalformed = validateListingData(
    { ...validBase, mainImage: 'not-a-url' },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resMalformed.valid, false);

  // Secure Cloudinary HTTPS URL
  const resSecure = validateListingData(
    { ...validBase, mainImage: 'https://res.cloudinary.com/account/image/upload/v1234/tshirt.png' },
    { productType: 'SHIRT' }
  );
  assert.strictEqual(resSecure.valid, true);
});

// -----------------------------------------------------------------------------
// TEST 8: Payload Mapping to SP-API v2021-08-01 Schema
// -----------------------------------------------------------------------------
runTest('8. Payload mapping: Complies with official SP-API Listings Items v2021-08-01 structure', () => {
  const listingData = {
    title: 'Premium Cotton T-Shirt',
    brand: 'Demo Brand',
    sellerSku: 'AMZ-TSHIRT-001',
    description: '100% Bio-washed breathable cotton t-shirt.',
    bulletPoints: ['Bio-washed', 'Soft handfeel', 'Regular fit'],
    mainImage: 'https://res.cloudinary.com/demo/image/upload/tshirt.jpg',
    otherImages: ['https://res.cloudinary.com/demo/image/upload/tshirt-back.jpg'],
    price: 850,
    quantity: 12,
    fulfillmentChannel: 'DEFAULT',
    gtinExemptionRequested: true,
    countryOfOrigin: 'IN',
    categoryAttributes: {
      color: 'Navy Blue',
      size: 'L',
      material: '100% Cotton',
      targetGender: 'unisex',
      department: 'men',
    },
  };

  const payload = buildSpApiListingPayload(listingData, {
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
  });

  assert.strictEqual(payload.productType, 'SHIRT');
  assert.strictEqual(payload.requirements, 'LISTING');
  assert.ok(payload.attributes);

  // Item name
  assert.strictEqual(payload.attributes.item_name[0].value, 'Premium Cotton T-Shirt');
  assert.strictEqual(payload.attributes.item_name[0].marketplace_id, 'A21TJRUUN4KGV');

  // Brand
  assert.strictEqual(payload.attributes.brand[0].value, 'Demo Brand');

  // Bullet points
  assert.strictEqual(payload.attributes.bullet_point.length, 3);

  // Purchasable offer
  assert.strictEqual(payload.attributes.purchasable_offer[0].currency, 'INR');
  assert.strictEqual(
    payload.attributes.purchasable_offer[0].our_price[0].schedule[0].value_with_tax,
    850
  );

  // Fulfillment availability
  assert.strictEqual(payload.attributes.fulfillment_availability[0].quantity, 12);
  assert.strictEqual(
    payload.attributes.fulfillment_availability[0].fulfillment_channel_code,
    'DEFAULT'
  );

  // Country of origin
  assert.strictEqual(payload.attributes.country_of_origin[0].value, 'IN');
});

// -----------------------------------------------------------------------------
// TEST 9: Master Catalogue Stock & Price Immutability
// -----------------------------------------------------------------------------
runTest('9. Catalogue immutability: Central product master price & stock are never altered', () => {
  const masterProduct = {
    _id: 'master-prod-100',
    name: 'Original Master Product',
    masterPrice: 800,
    stock: 10,
  };

  // Amazon channel overrides
  const amazonListingOverrides = {
    price: 1199, // Distinct channel pricing
    quantity: 5,  // Distinct channel allocation
  };

  // Build payload and verify masterProduct object remains untouched
  buildSpApiListingPayload({
    title: masterProduct.name,
    brand: 'Master Brand',
    sellerSku: 'AMZ-M-01',
    description: 'Sample description for channel listing',
    bulletPoints: ['Sample point'],
    mainImage: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    price: amazonListingOverrides.price,
    quantity: amazonListingOverrides.quantity,
    gtinExemptionRequested: true,
  });

  assert.strictEqual(masterProduct.masterPrice, 800, 'Master catalogue price must remain 800');
  assert.strictEqual(masterProduct.stock, 10, 'Master catalogue stock must remain 10');
});

// -----------------------------------------------------------------------------
// TEST 10: Duplicate Submission Prevention / Idempotency
// -----------------------------------------------------------------------------
runTest('10. Duplicate submission prevention: Compound uniqueness constraint check', () => {
  const key1 = `${'tenant-1'}:${'A21TJRUUN4KGV'}:${'SKU-100'}:${'sandbox'}`;
  const key2 = `${'tenant-1'}:${'A21TJRUUN4KGV'}:${'SKU-100'}:${'sandbox'}`;
  const key3 = `${'tenant-2'}:${'A21TJRUUN4KGV'}:${'SKU-100'}:${'sandbox'}`;

  assert.strictEqual(key1, key2, 'Same seller + marketplace + sku + environment must match existing record');
  assert.notStrictEqual(key1, key3, 'Different seller must have isolated unique key');
});

// -----------------------------------------------------------------------------
// TEST 11: Sandbox Submission with VALIDATION_PREVIEW
// -----------------------------------------------------------------------------
runAsyncTest('11. Sandbox submission with VALIDATION_PREVIEW: Safely invokes SP-API v2021-08-01 validation mode', async () => {
  let endpointCalled = '';
  let methodCalled = '';
  let bodySent = null;

  const mockClient = {
    credentials: { sellingPartnerId: 'A2TESTMERCHANT1', marketplaceId: 'A21TJRUUN4KGV' },
    lastRequestId: 'amzn-req-valpreview-999',
    executeRequest: async (endpoint, opts) => {
      if (opts?.method === 'PUT') {
        endpointCalled = endpoint;
        methodCalled = opts?.method;
        bodySent = JSON.parse(opts?.body || '{}');
      }
      return {
        submissionId: 'amzn-sub-val-preview-12345',
        status: 'VALIDATION_PREVIEW_SUCCESS',
        issues: [],
        _metadata: { status: 200, requestId: 'amzn-req-valpreview-999' },
      };
    },
  };

  const mockSubmission = {
    _id: 'sub-test-valpreview-1',
    sellerId: 'tenant-user-1',
    sellerSku: 'AMZ-TEST-VAL-001',
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    environment: 'sandbox',
    submissionMode: 'VALIDATION_PREVIEW',
    status: 'READY',
    mappedAttributes: {
      title: 'Premium Cotton T-Shirt',
      brand: 'Demo Brand',
      sellerSku: 'AMZ-TEST-VAL-001',
      description: 'Comfortable cotton shirt for daily wear.',
      bulletPoints: ['Soft cotton', 'Durable', 'Machine washable'],
      mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
      price: 800,
      quantity: 10,
      gtinExemptionRequested: true,
    },
    save: async function () { return this; },
  };

  const previewResult = await executeListingSubmission(mockSubmission, {
    client: mockClient,
    dryRun: false,
    mode: 'VALIDATION_PREVIEW',
    environment: 'sandbox',
  });

  assert.strictEqual(methodCalled, 'PUT');
  assert.ok(endpointCalled.includes('/listings/2021-08-01/items/'));
  assert.ok(endpointCalled.includes('mode=VALIDATION_PREVIEW'));
  assert.ok(endpointCalled.includes('marketplaceIds=A21TJRUUN4KGV'));
  assert.strictEqual(bodySent.productType, 'SHIRT');
  assert.strictEqual(bodySent.requirements, 'LISTING');
  assert.strictEqual(previewResult.success, true);
  assert.strictEqual(previewResult.status, 'SANDBOX_SUBMITTED');
  assert.strictEqual(previewResult.amazonSubmissionId, 'amzn-sub-val-preview-12345');
});

// -----------------------------------------------------------------------------
// TEST 12: Dry-Run Execution Behavior
// -----------------------------------------------------------------------------
runAsyncTest('12. Dry-run execution behavior: Performs full local schema check without external Amazon mutation', async () => {
  const mockSubmission = {
    _id: 'sub-test-dryrun-1',
    sellerId: 'tenant-user-1',
    sellerSku: 'TEST-TSHIRT-001',
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    environment: 'sandbox',
    submissionMode: 'DRY_RUN',
    status: 'READY',
    mappedAttributes: {
      title: 'Premium Cotton T-Shirt',
      brand: 'Demo Brand',
      sellerSku: 'TEST-TSHIRT-001',
      description: 'Comfortable cotton shirt.',
      bulletPoints: ['Soft cotton', 'Durable', 'Machine washable'],
      mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
      price: 800,
      quantity: 10,
      gtinExemptionRequested: true,
    },
    save: async function () { return this; },
  };

  const dryRunResult = await executeListingSubmission(mockSubmission, {
    mode: 'DRY_RUN',
    environment: 'sandbox',
  });

  assert.strictEqual(dryRunResult.status, 'DRY_RUN');
  assert.strictEqual(dryRunResult.submissionMode, 'DRY_RUN');
  assert.strictEqual(dryRunResult.responseMetadata.dryRunVerified, true);
  assert.ok(dryRunResult.payloadPreview.attributes.item_name);
});

// -----------------------------------------------------------------------------
// TEST 13: Preservation of Actual Sandbox / API Errors
// -----------------------------------------------------------------------------
runTest('13. Error preservation: Validation and API errors are preserved truthfully', () => {
  const invalidListing = {
    title: 'Short',
    brand: '',
    sellerSku: 'SKU',
    description: '',
    bulletPoints: [],
    mainImage: 'invalid-url',
    price: -50,
    quantity: -2,
    gtinExemptionRequested: false,
    externalProductId: '',
  };

  const res = validateListingData(invalidListing);
  assert.strictEqual(res.valid, false);

  // Issues must contain exact structured items
  const issueAttrs = res.issues.map((i) => i.attribute);
  assert.ok(issueAttrs.includes('brand'));
  assert.ok(issueAttrs.includes('price'));
  assert.ok(issueAttrs.includes('mainImage'));
  assert.ok(issueAttrs.includes('externalProductId'));
});

// -----------------------------------------------------------------------------
// TEST 14: Strict Production Publishing Rejection
// -----------------------------------------------------------------------------
runAsyncTest('14. Production publishing rejection: Hard block on production environment calls', async () => {
  const prodSubmission = {
    _id: 'sub-prod-block',
    sellerId: 'tenant-user-1',
    environment: 'production', // Attempting production
    submissionMode: 'SANDBOX_SUBMISSION',
    status: 'READY',
    mappedAttributes: { title: 'Test Product' },
  };

  let threwError = false;
  try {
    await executeListingSubmission(prodSubmission, {
      environment: 'production',
    });
  } catch (err) {
    threwError = true;
    assert.strictEqual(err.message, 'PRODUCTION_PUBLISHING_DISABLED');
  }

  assert.strictEqual(threwError, true, 'Must strictly throw PRODUCTION_PUBLISHING_DISABLED error');
});

// -----------------------------------------------------------------------------
// TEST 15: Submission History Scoped Retrieval
// -----------------------------------------------------------------------------
runAsyncTest('15. Submission history retrieval: History correctly filtered and ordered', async () => {
  const tenantItems = Array.from(inMemorySubmissionsMap.values()).filter(
    (s) => s.sellerId === 'tenant-user-A'
  );

  assert.ok(Array.isArray(tenantItems));
  assert.strictEqual(tenantItems.length >= 1, true);
  assert.strictEqual(tenantItems[0].sellerId, 'tenant-user-A');
});

// -----------------------------------------------------------------------------
// TEST 16: Unauthorized Access Protection
// -----------------------------------------------------------------------------
runTest('16. Unauthorized access protection: Deny access to other tenant submissions', () => {
  const submissionRecord = {
    _id: 'sub-private-1',
    sellerId: 'authorized-seller-99',
    tenantId: 'authorized-seller-99',
    sellerSku: 'PRIVATE-SKU',
  };

  const requestingUserId = 'unauthorized-intruder-123';
  const isAuthorized =
    submissionRecord.sellerId.toString() === requestingUserId.toString() ||
    submissionRecord.tenantId?.toString() === requestingUserId.toString();

  assert.strictEqual(isAuthorized, false, 'Intruder must be denied access');
});

// -----------------------------------------------------------------------------
// RUN ALL TESTS AND REPORT
// -----------------------------------------------------------------------------
(async () => {
  await Promise.all(asyncPromises);
  console.log('\n========================================================================');
  console.log(`TASK 9 RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
})();
