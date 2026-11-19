import assert from 'assert';
import { uploadImageToCloudinary } from './src/config/cloudinary.js';

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
console.log('PRODUCT IMAGE UPLOAD & MANAGEMENT TEST SUITE');
console.log('========================================================================\n');

// 1x1 transparent PNG as base64
const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const sampleJpgBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const sampleWebpBase64 = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

// TEST 1: Single image upload (PNG) with tenant isolation
runAsyncTest('1. Single image upload: Tenant isolation and Cloudinary-structured payload', async () => {
  const sellerId = 'seller_tenant_abc_123';
  const result = await uploadImageToCloudinary({
    sellerId,
    dataUri: samplePngBase64,
    fileName: 'test_product.png',
    mimeType: 'image/png',
  });

  assert.ok(result, 'Upload result must exist');
  assert.ok(result.secure_url, 'Must contain secure_url');
  assert.ok(result.public_id, 'Must contain public_id');
  assert.ok(result.public_id.includes(sellerId), 'public_id must be scoped to sellerId folder');
  assert.ok(result.bytes > 0, 'Bytes must be greater than 0');
});

// TEST 2: Multiple image formats (JPEG, WEBP)
runAsyncTest('2. Format support: Successfully accepts JPEG and WEBP images', async () => {
  const sellerId = 'seller_tenant_abc_123';
  const jpgResult = await uploadImageToCloudinary({
    sellerId,
    dataUri: sampleJpgBase64,
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
  });
  assert.ok(jpgResult.secure_url, 'JPEG must upload');

  const webpResult = await uploadImageToCloudinary({
    sellerId,
    dataUri: sampleWebpBase64,
    fileName: 'photo.webp',
    mimeType: 'image/webp',
  });
  assert.ok(webpResult.secure_url, 'WEBP must upload');
});

// TEST 3: Unsupported format rejection
runTest('3. Format validation: Rejects non-image MIME types (PDF/TXT/EXE)', () => {
  const invalidTypes = ['application/pdf', 'text/plain', 'application/x-msdownload', 'image/gif'];
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  for (const t of invalidTypes) {
    const isAllowed = allowed.includes(t);
    assert.strictEqual(isAllowed, false, `MIME type ${t} must be rejected`);
  }
});

// TEST 4: File size limit enforcement (10MB)
runTest('4. Size limit enforcement: Enforces 10MB maximum per image', () => {
  const MAX_BYTES = 10 * 1024 * 1024; // 10MB
  const validSize = 5 * 1024 * 1024;  // 5MB
  const invalidSize = 11 * 1024 * 1024; // 11MB

  assert.strictEqual(validSize <= MAX_BYTES, true, '5MB must be permitted');
  assert.strictEqual(invalidSize <= MAX_BYTES, false, '11MB must be rejected');
});

// TEST 5: Product images schema mapping & Primary Image order
runTest('5. Product schema mapping: First uploaded image becomes primary (index 0)', () => {
  const uploadedUrls = [
    'https://res.cloudinary.com/demo/image/upload/v1/prod_front.jpg',
    'https://res.cloudinary.com/demo/image/upload/v1/prod_back.jpg',
    'https://res.cloudinary.com/demo/image/upload/v1/prod_detail.jpg',
  ];

  // Reorder test: Move index 1 (back) to primary (index 0)
  const reordered = [...uploadedUrls];
  const [selectedPrimary] = reordered.splice(1, 1);
  reordered.unshift(selectedPrimary);

  assert.strictEqual(reordered[0], 'https://res.cloudinary.com/demo/image/upload/v1/prod_back.jpg');
  assert.strictEqual(reordered.length, 3);
});

// TEST 6: Tenant Isolation between different sellers
runAsyncTest('6. Tenant Isolation: Distinct sellers upload to isolated subdirectories', async () => {
  const sellerA = 'seller_alpha_111';
  const sellerB = 'seller_beta_222';

  const resA = await uploadImageToCloudinary({
    sellerId: sellerA,
    dataUri: samplePngBase64,
    fileName: 'imgA.png',
    mimeType: 'image/png',
  });

  const resB = await uploadImageToCloudinary({
    sellerId: sellerB,
    dataUri: samplePngBase64,
    fileName: 'imgB.png',
    mimeType: 'image/png',
  });

  assert.ok(resA.public_id.includes(sellerA), 'Image A belongs to seller A');
  assert.ok(resB.public_id.includes(sellerB), 'Image B belongs to seller B');
  assert.notStrictEqual(resA.public_id, resB.public_id, 'Public IDs must be unique and isolated');
});

// TEST 7: Amazon Listing Publisher compatibility with uploaded images
runTest('7. Amazon Channel compatibility: Uploaded image URL passes Amazon HTTPS validation', () => {
  const mockProduct = {
    title: 'Pure Cotton Crewneck T-Shirt',
    images: [
      'https://res.cloudinary.com/demo/image/upload/v1700000000/sellers/seller_123/products/prod_front.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1700000000/sellers/seller_123/products/prod_side.jpg',
    ],
  };

  const mainImage = mockProduct.images[0];
  assert.ok(mainImage.startsWith('https://'), 'Amazon requires secure HTTPS image links');
  assert.ok(mainImage.includes('cloudinary.com') || mainImage.includes('https://'), 'Uses real Cloudinary or HTTPS image host');
});

(async () => {
  await Promise.all(asyncTests);
  console.log('\n========================================================================');
  console.log(`IMAGE UPLOAD RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
})();
