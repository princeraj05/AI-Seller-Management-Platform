import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractOrdersFromResponse,
  fetchOrdersSafely,
  createSingleFlightSyncGuard,
} from '../../frontend/src/utils/ordersListHelpers.js';
import {
  selectProductImages,
  inspectListingImageUrl,
  normalizeListingValidationResponse,
  resolveSchemaValidationBadge,
  canProceedToListingSubmission,
} from '../../frontend/src/utils/amazonListingHelpers.js';
import {
  validateAmazonListing,
  sanitizeEligibleProduct,
} from '../src/modules/channels/channel.controller.js';
import { inMemoryProductsMap } from '../src/modules/products/product.service.js';
import { Product } from '../src/modules/products/product.model.js';
import { ChannelConnection } from '../src/modules/channels/channelConnection.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const ordersListSource = fs.readFileSync(
  path.join(repoRoot, 'frontend/src/pages/orders/OrdersList.jsx'),
  'utf8'
);
const publisherSource = fs.readFileSync(
  path.join(repoRoot, 'frontend/src/pages/marketplaces/AmazonListingPublisher.jsx'),
  'utf8'
);
const publisherServiceSource = fs.readFileSync(
  path.join(repoRoot, 'backend/src/integrations/marketplaces/amazon/amazon.publisher.service.js'),
  'utf8'
);

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

// ============================================================================
// 1. Orders API Returning an Empty Array
// ============================================================================
test('1. Orders API empty array returns empty list with no error and no fabricated orders', async () => {
  const result = await fetchOrdersSafely(async () => ({
    success: true,
    orders: [],
    data: { orders: [] },
  }));

  assert.deepEqual(result.orders, []);
  assert.equal(result.error, null);
});

// ============================================================================
// 2. Orders API Failure
// ============================================================================
test('2. Orders API failure returns empty list with explicit error message and never falls back to mock orders', async () => {
  const result = await fetchOrdersSafely(async () => {
    throw new Error('503 Service Unavailable: Orders database unreachable');
  });

  assert.deepEqual(result.orders, []);
  assert.equal(result.error, '503 Service Unavailable: Orders database unreachable');
});

// ============================================================================
// 3. No Mock Orders Displayed & Real Database Orders Preserved
// ============================================================================
test('3. OrdersList.jsx removes mockOrders completely and preserves real API orders', async () => {
  assert.equal(ordersListSource.includes('mockOrders'), false, 'OrdersList.jsx must not reference mockOrders');
  assert.equal(ordersListSource.includes('utils/mockData'), false, 'OrdersList.jsx must not import utils/mockData');
  assert.ok(ordersListSource.includes('ordersError'), 'OrdersList.jsx must track and display ordersError state');
  assert.ok(ordersListSource.includes('No orders found in the database.'), 'OrdersList.jsx must show an explicit empty state');

  const realOrders = [
    { _id: 'ord-1', externalOrderId: '402-1234567-1234567', channel: 'AMAZON', totalAmount: 1499 },
    { _id: 'ord-2', orderNumber: 'POS-9901', channel: 'POS', totalAmount: 550 },
  ];
  const result = await fetchOrdersSafely(async () => ({ success: true, data: { orders: realOrders } }));
  assert.equal(result.error, null);
  assert.equal(result.orders.length, 2);
  assert.equal(result.orders[0].externalOrderId, '402-1234567-1234567');
  assert.deepEqual(extractOrdersFromResponse({ orders: realOrders }), realOrders);
});

// ============================================================================
// 4. Duplicate Sync Clicks Guard
// ============================================================================
test('4. Duplicate sync clicks are blocked while a sync request is in flight', async () => {
  assert.ok(
    ordersListSource.includes('if (syncingAmazon) return;'),
    'OrdersList.jsx must include early guard: if (syncingAmazon) return;'
  );

  let callCount = 0;
  let releaseSync;
  const guardedSync = createSingleFlightSyncGuard(
    () =>
      new Promise((resolve) => {
        callCount += 1;
        releaseSync = () => resolve({ totalFetched: 3 });
      })
  );

  // Fire 3 rapid concurrent clicks before the first request finishes
  const first = guardedSync();
  const second = guardedSync();
  const third = guardedSync();

  const [secondRes, thirdRes] = await Promise.all([second, third]);
  assert.equal(secondRes.skipped, true);
  assert.equal(thirdRes.skipped, true);
  assert.equal(callCount, 1, 'Sync API must only be invoked once during rapid duplicate clicks');

  releaseSync();
  const firstRes = await first;
  assert.equal(firstRes.skipped, false);
  assert.deepEqual(firstRes.result, { totalFetched: 3 });

  // After completion, a subsequent sync click is permitted again
  const fourth = guardedSync();
  releaseSync();
  const fourthRes = await fourth;
  assert.equal(fourthRes.skipped, false);
  assert.equal(callCount, 2);
});

// ============================================================================
// 5. Correct Product Image Selection (Cloudinary Preserved, No Cross-Product Substitution)
// ============================================================================
test('5. Product image selection uses only the selected product verified URLs and preserves Cloudinary', () => {
  const cloudinaryUrl = 'https://res.cloudinary.com/drg63nu8h/image/upload/v1795278332/sellers/abc/products/item1.png';
  const secondCloudinaryUrl = 'https://res.cloudinary.com/drg63nu8h/image/upload/v1795278333/sellers/abc/products/item2.png';

  const productA = {
    _id: 'prod-a',
    title: 'Handcrafted Wall Hanging',
    images: [{ secure_url: cloudinaryUrl }, secondCloudinaryUrl, cloudinaryUrl],
  };
  const productB = {
    _id: 'prod-b',
    title: 'Plain Product Without Image',
    images: [],
  };

  const selectedA = selectProductImages(productA);
  assert.equal(selectedA.mainImage, cloudinaryUrl);
  assert.deepEqual(selectedA.otherImages, [secondCloudinaryUrl]);

  const inspectionA = inspectListingImageUrl(selectedA.mainImage);
  assert.equal(inspectionA.displayable, true);
  assert.equal(inspectionA.amazonEligible, true);
  assert.equal(inspectionA.isCloudinary, true);
  assert.equal(inspectionA.resolvedUrl, cloudinaryUrl);

  // Selecting productB must never retain or substitute productA's image or a stock photo
  const selectedB = selectProductImages(productB);
  assert.equal(selectedB.mainImage, '');
  assert.deepEqual(selectedB.otherImages, []);

  // Backend sanitizer also extracts Cloudinary secure_url cleanly
  const sanitized = sanitizeEligibleProduct(productA);
  assert.deepEqual(sanitized.images, [cloudinaryUrl, secondCloudinaryUrl, cloudinaryUrl]);

  // Backend publisher service must not hardcode the Unsplash portrait fallback URL
  assert.equal(
    publisherServiceSource.includes('photo-1521572267360-ee0c2909d518'),
    false,
    'amazon.publisher.service.js must not inject hardcoded Unsplash portrait URL'
  );
});

// ============================================================================
// 6. Missing Image Placeholder
// ============================================================================
test('6. Missing product image maps cleanly to neutral placeholder state', () => {
  for (const emptyInput of ['', '   ', null, undefined, {}]) {
    const info = inspectListingImageUrl(emptyInput);
    assert.equal(info.status, 'missing');
    assert.equal(info.displayable, false);
    assert.equal(info.resolvedUrl, null);
    assert.equal(info.amazonEligible, false);
  }
});

// ============================================================================
// 7. Invalid Image Fallback
// ============================================================================
test('7. Invalid image URLs map to neutral placeholder and local /uploads is flagged non-Amazon-eligible', () => {
  const invalidUrls = [
    'blob:http://localhost:3000/abc-123',
    'data:image/png;base64,iVBORw0KGgo=',
    'http://example.com/insecure.jpg',
    'file:///C:/Users/test/shirt.jpg',
    'C:\\Users\\test\\shirt.jpg',
    'javascript:alert(1)',
    'https://localhost:5000/uploads/products/test.jpg',
    'not-a-valid-url',
  ];

  for (const url of invalidUrls) {
    const info = inspectListingImageUrl(url);
    assert.equal(info.status, 'invalid', `Expected "${url}" to be classified invalid`);
    assert.equal(info.displayable, false, `Expected "${url}" not to be rendered as <img>`);
    assert.equal(info.resolvedUrl, null);
    assert.equal(info.amazonEligible, false);
  }

  // Local /uploads asset is previewable locally but flagged as not Amazon-eligible
  const localUpload = inspectListingImageUrl('/uploads/products/black_tshirt_prod_1794939738784_a8e8fb10.jpg');
  assert.equal(localUpload.status, 'local_dev');
  assert.equal(localUpload.displayable, true);
  assert.equal(localUpload.amazonEligible, false);
  assert.equal(localUpload.isLocalUpload, true);
});

// ============================================================================
// 8. Validation Error Details & Re-Validation Updates
// ============================================================================
test('8. Validation exposes every error with attribute name and reason, and re-validation updates error list', async () => {
  // 8a. Backend HTTP 400 (MISSING_PRODUCT_TYPE) returns structured attribute-level error details
  const reqMissingType = {
    tenant: { sellerId: 'seller-2b8', storeId: null },
    body: { productId: 'prod-2b8-1', productType: '' },
  };
  const resMissingType = createMockRes();
  await validateAmazonListing(reqMissingType, resMissingType);

  assert.equal(resMissingType.statusCode, 400);
  assert.equal(resMissingType.body.code, 'MISSING_PRODUCT_TYPE');
  assert.equal(resMissingType.body.valid, false);
  assert.equal(resMissingType.body.schemaSource, 'INTERNAL_VALIDATION');
  assert.ok(Array.isArray(resMissingType.body.errors) && resMissingType.body.errors.length === 1);
  assert.equal(resMissingType.body.errors[0].attribute, 'productType');

  const normalized400 = normalizeListingValidationResponse(resMissingType.body, null);
  assert.equal(normalized400.valid, false);
  assert.equal(normalized400.errors.length, 1);
  assert.equal(normalized400.errors[0].attribute, 'productType');
  assert.equal(normalized400.errors[0].attributeLabel, 'Amazon Product Type');
  assert.match(normalized400.errors[0].message, /Product Type is required/i);

  // 8b. Backend HTTP 200 with invalid local otherImages + missing GTIN exposes EVERY error cleanly
  const testProdId = 'prod-2b8-tshirt';
  inMemoryProductsMap.set(testProdId, {
    _id: testProdId,
    sellerId: 'seller-2b8',
    storeId: null,
    title: 'Premium Cotton T-Shirt',
    sku: 'TEST-TSHIRT-001',
    brand: 'Demo Brand',
    description: 'Premium cotton casual t-shirt',
    images: [
      'https://res.cloudinary.com/drg63nu8h/image/upload/v1/sellers/seller-2b8/products/tshirt.png',
      '/uploads/products/black_tshirt_prod_1794939738784_a8e8fb10.jpg',
    ],
    masterPrice: 800,
    stock: 10,
    status: 'Active',
  });

  const origFindOne = Product.findOne;
  const origChannelFindOne = ChannelConnection.findOne;
  Product.findOne = () => {
    throw new Error('Offline test uses inMemoryProductsMap');
  };
  ChannelConnection.findOne = () => {
    throw new Error('Offline test has no live Amazon connection');
  };

  try {
    const reqWithErrors = {
      tenant: { sellerId: 'seller-2b8', storeId: null },
      body: {
        productId: testProdId,
        productType: 'SHIRT',
        sellerSku: 'AMZ-TEST-TSHIRT-001',
        gtinExemptionRequested: false,
        mappedAttributes: {
          title: 'Premium Cotton T-Shirt',
          brand: 'Demo Brand',
          sellerSku: 'AMZ-TEST-TSHIRT-001',
          description: 'Premium cotton casual t-shirt for daily comfort.',
          bulletPoints: ['100% pure cotton'],
          mainImage: 'https://res.cloudinary.com/drg63nu8h/image/upload/v1/sellers/seller-2b8/products/tshirt.png',
          otherImages: ['/uploads/products/black_tshirt_prod_1794939738784_a8e8fb10.jpg'],
          price: '800',
          quantity: '10',
          gtinExemptionRequested: false,
          externalProductId: '',
        },
      },
    };
    const resWithErrors = createMockRes();
    await validateAmazonListing(reqWithErrors, resWithErrors);

    assert.equal(resWithErrors.statusCode, 200);
    assert.equal(resWithErrors.body.valid, false);
    assert.equal(resWithErrors.body.schemaSource, 'DEVELOPMENT_FALLBACK');
    const normalizedInvalid = normalizeListingValidationResponse(resWithErrors.body, null);
    assert.equal(normalizedInvalid.valid, false);
    assert.ok(normalizedInvalid.errors.some((e) => e.attribute === 'otherImages' && e.code === 'UNRESOLVED_IMAGE_URL'));
    assert.ok(normalizedInvalid.errors.some((e) => e.attribute === 'externalProductId' && e.code === 'MISSING_GTIN'));

    // 8c. Re-validation after fixing the issues clears the errors list
    const reqFixed = {
      tenant: { sellerId: 'seller-2b8', storeId: null },
      body: {
        ...reqWithErrors.body,
        gtinExemptionRequested: true,
        mappedAttributes: {
          ...reqWithErrors.body.mappedAttributes,
          otherImages: [],
          gtinExemptionRequested: true,
        },
      },
    };
    const resFixed = createMockRes();
    await validateAmazonListing(reqFixed, resFixed);

    assert.equal(resFixed.statusCode, 200);
    assert.equal(resFixed.body.valid, true);
    const normalizedValid = normalizeListingValidationResponse(resFixed.body, null);
    assert.equal(normalizedValid.valid, true);
    assert.equal(normalizedValid.errors.length, 0);
  } finally {
    Product.findOne = origFindOne;
    ChannelConnection.findOne = origChannelFindOne;
    inMemoryProductsMap.delete(testProdId);
  }
});

// ============================================================================
// 9. Development Fallback Schema Labeling (Never Shows Green Official Verification)
// ============================================================================
test('9. Development fallback and internal validation are never labeled as official Amazon schema verification', () => {
  const fallbackBadge = resolveSchemaValidationBadge('DEVELOPMENT_FALLBACK');
  assert.equal(fallbackBadge.isOfficial, false);
  assert.equal(fallbackBadge.tone, 'fallback');
  assert.match(fallbackBadge.title, /Not Official Amazon Schema/i);

  const internalBadge = resolveSchemaValidationBadge('INTERNAL_VALIDATION');
  assert.equal(internalBadge.isOfficial, false);
  assert.equal(internalBadge.tone, 'internal');

  const nullBadge = resolveSchemaValidationBadge(null);
  assert.equal(nullBadge.isOfficial, false);
  assert.equal(nullBadge.tone, 'internal');

  const officialBadge = resolveSchemaValidationBadge('AMAZON_SP_API');
  assert.equal(officialBadge.isOfficial, true);
  assert.equal(officialBadge.tone, 'official');

  // Verify AmazonListingPublisher.jsx gates green official banner strictly behind schemaBadge.isOfficial
  assert.ok(
    publisherSource.includes('schemaBadge.isOfficial ? ('),
    'AmazonListingPublisher.jsx must only show green official verification when schemaBadge.isOfficial is true'
  );
});

// ============================================================================
// 10. Submission Remains Disabled With Validation Errors or Unvalidated/Stale State
// ============================================================================
test('10. Proceed to Submission remains disabled while unvalidated, stale, validating, or having errors', () => {
  // Never validated
  assert.equal(canProceedToListingSubmission(null), false);

  // Validation errors present
  const invalidRes = normalizeListingValidationResponse({
    valid: false,
    errors: [{ attribute: 'price', code: 'INVALID_PRICE', severity: 'ERROR', message: 'Price must be > 0' }],
  });
  assert.equal(canProceedToListingSubmission(invalidRes), false);

  // Contradictory payload (valid: true but errors non-empty) must still stay disabled
  assert.equal(
    canProceedToListingSubmission({
      valid: true,
      errors: [{ attribute: 'brand', message: 'Missing brand' }],
    }),
    false
  );

  // Valid result while re-validation is in flight or form was modified (stale)
  const validRes = normalizeListingValidationResponse({
    valid: true,
    errors: [],
    warnings: [],
    schemaSource: 'DEVELOPMENT_FALLBACK',
  });
  assert.equal(canProceedToListingSubmission(validRes, { validating: true }), false);
  assert.equal(canProceedToListingSubmission(validRes, { isStale: true }), false);

  // Fresh, error-free validation result enables proceeding
  assert.equal(canProceedToListingSubmission(validRes, { validating: false, isStale: false }), true);

  // Confirm UI binds Proceed to Submission and Step 7 strictly to canProceedToSubmission
  assert.ok(
    publisherSource.includes('disabled={!canProceedToSubmission}'),
    'Proceed to Submission button must be disabled when !canProceedToSubmission'
  );
  assert.ok(
    publisherSource.includes('(s.step === 7 && !canProceedToSubmission)'),
    'Stepper Step 7 must be disabled when !canProceedToSubmission'
  );
});
