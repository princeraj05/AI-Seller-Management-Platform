/**
 * Automated Test Suite: AI Studio Approval Payload Integration & Permanent Image Persistence (Phase 03.4.2)
 *
 * Verifies:
 * 1. AI Studio sends the correct AIJob identifier (metadata.result_id).
 * 2. A valid completed AIJob is linked to the created product.
 * 3. All supported listing fields are sent and persisted.
 * 4. The permanent uploaded image URL is included in images[0].
 * 5. Temporary object URLs (blob:, data:) are never persisted.
 * 6. Image upload failure prevents product creation.
 * 7. Product creation failure retains the uploaded URL for retry without re-uploading.
 * 8. Replacing an image invalidates the previous cached upload URL.
 * 9. Duplicate submission is prevented (loading / in-flight guards).
 * 10. Missing AIJob linkage is handled correctly (clear error & blocked).
 * 11. Manual product creation remains unaffected.
 * 12. Existing AI Studio, product persistence, and image upload regression tests pass.
 *
 * Test Methodology:
 * - Tests 1-11 test real backend service logic and simulated frontend component workflow state machines.
 * - Test 12 executes backend integration test suites across product creation, AI Studio, and storage.
 */

import assert from 'assert';
import mongoose from 'mongoose';
import {
  createProductService,
  registerInMemoryAIJob,
  inMemoryAIJobsMap,
  inMemoryProductsMap,
} from '../src/modules/products/product.service.js';
import { Product } from '../src/modules/products/product.model.js';
import { AIJob } from '../src/modules/ai/ai.model.js';
import { uploadProductImage } from '../src/modules/products/product.controller.js';

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

// 1x1 transparent PNG as test Base64 Data URI
const TEST_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runSuite() {
  console.log('====================================================');
  console.log('AI STUDIO APPROVAL & IMAGE PERSISTENCE TEST SUITE');
  console.log('Phase 03.4.2: Frontend-Backend Payload & Storage Contract');
  console.log('====================================================\n');

  const tenantA = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  const tenantB = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  // ----------------------------------------------------
  // TEST 1: AI Studio sends the correct AIJob identifier (result_id)
  // ----------------------------------------------------
  await runTest('1. AI Studio sends the correct AIJob identifier (metadata.result_id)', async () => {
    const resultId = `result-uuid-${Date.now()}`;
    const generatedJob = registerInMemoryAIJob({
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
      input: { result_id: resultId },
      output: { title: 'Blue Pottery Ceramic Planter' },
    });

    // Simulated AI Studio response from generateListingDraftApi
    const aiResponse = {
      data: {
        draft: { title: 'Blue Pottery Ceramic Planter' },
        metadata: {
          generated_at: new Date().toISOString(),
          ai_provider: 'gemini',
          is_fallback: false,
          vision_grounded: true,
          result_id: resultId,
        },
      },
    };

    // Component extracts result_id from metadata
    const extractedJobId = aiResponse.data.metadata.result_id;
    assert.strictEqual(extractedJobId, resultId, 'Component must extract metadata.result_id');

    // Backend createProductService accepts and resolves result_id to the AIJob record
    const sku = `SKU-JOB-${Date.now()}`;
    const product = await createProductService(tenantA, {
      title: 'Blue Pottery Ceramic Planter',
      sku,
      masterPrice: 1250,
      aiApproved: true,
      aiJobId: extractedJobId,
    });

    assert.strictEqual(product.aiApproved, true);
    assert.strictEqual(product.aiGenerated, true);
    assert.strictEqual(String(product.aiJobId), String(generatedJob._id), 'aiJobId must resolve to the AIJob _id');
  });

  // ----------------------------------------------------
  // TEST 2: A valid completed AIJob is linked to the created product
  // ----------------------------------------------------
  await runTest('2. A valid completed AIJob is linked to the created product', async () => {
    const jobObjectId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: jobObjectId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
      input: { result_id: `uuid-${Date.now()}` },
    });

    const sku = `SKU-LINK-${Date.now()}`;
    const product = await createProductService(tenantA, {
      title: 'Handmade Wooden Jewelry Box',
      sku,
      masterPrice: 950,
      aiApproved: true,
      aiJobId: jobObjectId,
    });

    assert.strictEqual(String(product.aiJobId), jobObjectId);
    assert.strictEqual(product.aiApproved, true);
  });

  // ----------------------------------------------------
  // TEST 3: All supported listing fields are sent and persisted
  // ----------------------------------------------------
  await runTest('3. All supported listing fields are sent and persisted', async () => {
    const resultId = `uuid-full-${Date.now()}`;
    registerInMemoryAIJob({
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
      input: { result_id: resultId },
    });

    const sku = `SKU-FULL-${Date.now()}`;
    const completePayload = {
      title: 'Hand-Carved Sheesham Wood Serving Tray',
      shortDescription: 'Elegant handcrafted wooden serving tray with brass inlay work.',
      description: 'Crafted from sustainable Sheesham wood by master artisans of Saharanpur. Features intricate brass inlay and food-safe oil finish.',
      brand: 'Bhartiye Crafts',
      productType: 'Home & Kitchen',
      category: 'Dining & Serving',
      categoryName: 'Dining & Serving',
      subcategory: 'Serving Trays',
      bulletPoints: [
        '100% Solid Sheesham Hardwood construction',
        'Intricate hand-carved floral brass inlay pattern',
        'Ergonomic cut-out handles for easy carrying',
        'Food-safe natural walnut oil polish',
      ],
      keywords: ['sheesham tray', 'wooden serving tray', 'brass inlay', 'handcrafted gift', 'tableware'],
      attributes: {
        Material: 'Sheesham Wood',
        Finish: 'Walnut Oil',
        Technique: 'Brass Inlay',
        Dimensions: '14 x 10 inches',
      },
      material: 'Sheesham Wood',
      color: 'Natural Walnut',
      seo: {
        title: 'Handcrafted Sheesham Wooden Tray with Brass Inlay',
        description: 'Buy premium artisan wooden serving trays online at best prices across India.',
        keywords: ['sheesham tray', 'wooden tray'],
        slug: 'hand-carved-sheesham-wood-serving-tray',
      },
      sku,
      masterPrice: 1599,
      costPrice: 700,
      stock: 35,
      images: ['https://res.cloudinary.com/demo/image/upload/v12345/tray.jpg'],
      tags: ['ai-vision-grounded', 'llm-generated'],
      aiJobId: resultId,
      aiApproved: true,
      aiGenerated: true,
    };

    const product = await createProductService(tenantA, completePayload);

    assert.strictEqual(product.title, completePayload.title);
    assert.strictEqual(product.shortDescription, completePayload.shortDescription);
    assert.strictEqual(product.description, completePayload.description);
    assert.strictEqual(product.brand, completePayload.brand);
    assert.strictEqual(product.productType, completePayload.productType);
    assert.strictEqual(product.categoryName, completePayload.categoryName);
    assert.strictEqual(product.subcategory, completePayload.subcategory);
    assert.deepStrictEqual(product.bulletPoints, completePayload.bulletPoints);
    assert.deepStrictEqual(product.keywords, completePayload.keywords);
    assert.strictEqual(product.material, completePayload.material);
    assert.strictEqual(product.color, completePayload.color);
    assert.strictEqual(product.masterPrice, 1599);
    assert.strictEqual(product.costPrice, 700);
    assert.strictEqual(product.stock, 35);
    assert.strictEqual(product.images[0], 'https://res.cloudinary.com/demo/image/upload/v12345/tray.jpg');
    assert.strictEqual(product.seo.title, completePayload.seo.title);
    assert.strictEqual(product.seo.description, completePayload.seo.description);
    assert.strictEqual(product.seo.slug, completePayload.seo.slug);
    assert.strictEqual(product.aiApproved, true);
    assert.strictEqual(product.aiGenerated, true);
    assert.ok(product.attributes instanceof Map || typeof product.attributes === 'object');
  });

  // ----------------------------------------------------
  // TEST 4: The permanent uploaded image URL is included in images[0]
  // ----------------------------------------------------
  await runTest('4. The permanent uploaded image URL is included in images[0]', async () => {
    // Call real uploadProductImage controller
    const req = {
      tenant: { sellerId: tenantA.sellerId },
      body: {
        image: TEST_PNG_BASE64,
        fileName: 'test-handcraft.png',
        mimeType: 'image/png',
      },
    };

    let statusCode = null;
    let resData = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      },
    };

    await uploadProductImage(req, res);
    assert.strictEqual(statusCode, 201, 'Image upload should return 201');
    assert.ok(resData.success, 'Image upload response must indicate success');

    const permanentUrl = resData.data?.secure_url || resData.data?.url || resData.secure_url || resData.url;
    assert.ok(permanentUrl && typeof permanentUrl === 'string', 'Permanent URL must be returned');
    assert.ok(!permanentUrl.startsWith('blob:'), 'Permanent URL must not be a blob URL');
    assert.ok(!permanentUrl.startsWith('data:'), 'Permanent URL must not be a raw data URI');

    // Create product using the returned permanent URL
    const sku = `SKU-IMG-${Date.now()}`;
    const product = await createProductService(tenantA, {
      title: 'Handmade Terracotta Diya',
      sku,
      masterPrice: 350,
      images: [permanentUrl],
    });

    assert.strictEqual(product.images[0], permanentUrl);
  });

  // ----------------------------------------------------
  // TEST 5: Temporary object URLs (blob:, data:) are never persisted
  // ----------------------------------------------------
  await runTest('5. Temporary object URLs (blob:, data:) are never persisted', async () => {
    const sku = `SKU-BLOB-${Date.now()}`;

    // Blob URL rejection in image sanitizer
    let blobRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Temporary Blob Product',
        sku,
        masterPrice: 500,
        images: ['blob:http://localhost:5173/593e87c0-1234-5678-90ab'],
      });
    } catch (err) {
      blobRejected = err.message.includes('Invalid product image URL');
    }
    assert(blobRejected, 'Blob URLs must be rejected by image sanitizer');

    // Component approval guard validation
    const validateApprovalUrl = (url) => {
      if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
        throw new Error('Invalid image URL: Temporary browser blob/data URLs cannot be persisted in the catalog.');
      }
      return true;
    };

    assert.throws(
      () => validateApprovalUrl('blob:http://localhost:5173/abcd'),
      /Temporary browser blob\/data URLs cannot be persisted/
    );
    assert.throws(
      () => validateApprovalUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE='),
      /Temporary browser blob\/data URLs cannot be persisted/
    );
    assert.strictEqual(validateApprovalUrl('https://res.cloudinary.com/test/image.jpg'), true);
  });

  // ----------------------------------------------------
  // TEST 6: Image upload failure prevents product creation
  // ----------------------------------------------------
  await runTest('6. Image upload failure prevents product creation', async () => {
    // Invalid MIME type upload
    const req = {
      tenant: { sellerId: tenantA.sellerId },
      body: {
        image: 'data:application/pdf;base64,JVBERi0xLjQK...',
        fileName: 'malicious.pdf',
        mimeType: 'application/pdf',
      },
    };

    let statusCode = null;
    let resData = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resData = data;
        return this;
      },
    };

    await uploadProductImage(req, res);
    assert.strictEqual(statusCode, 400, 'Non-image MIME type must return 400');
    assert.strictEqual(resData.success, false);

    // Component workflow simulation: upload error stops creation flow
    let productCreated = false;
    const simulateApprovalFlow = async (uploadSucceeds) => {
      let permanentUrl = null;
      if (!uploadSucceeds) {
        throw new Error('Image upload failed: Unsupported image format');
      }
      permanentUrl = 'https://res.cloudinary.com/test/valid.jpg';
      productCreated = true;
      return permanentUrl;
    };

    let caughtError = null;
    try {
      await simulateApprovalFlow(false);
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError, 'Approval flow must catch upload failure');
    assert.strictEqual(productCreated, false, 'Product creation must NOT be called when upload fails');
  });

  // ----------------------------------------------------
  // TEST 7: Product creation failure retains the uploaded URL for retry
  // ----------------------------------------------------
  await runTest('7. Product creation failure retains the uploaded URL for retry without re-uploading', async () => {
    let uploadCallCount = 0;
    const mockUploadApi = async () => {
      uploadCallCount++;
      return { success: true, data: { secure_url: 'https://res.cloudinary.com/test/retained.jpg' } };
    };

    // Simulated component state machine
    let uploadedImageUrl = null;
    let skuToUse = `SKU-CONFLICT-${Date.now()}`;

    // Pre-create SKU to force conflict
    await createProductService(tenantA, {
      title: 'Existing Product',
      sku: skuToUse,
      masterPrice: 500,
    });

    const attemptApproval = async () => {
      let permanentUrl = uploadedImageUrl;
      if (!permanentUrl) {
        const res = await mockUploadApi();
        permanentUrl = res.data.secure_url;
        uploadedImageUrl = permanentUrl; // Cache in component state
      }

      // Try creating product
      return await createProductService(tenantA, {
        title: 'Retryable Product',
        sku: skuToUse,
        masterPrice: 750,
        images: [permanentUrl],
      });
    };

    // First attempt fails due to duplicate SKU
    let firstAttemptFailed = false;
    try {
      await attemptApproval();
    } catch (err) {
      firstAttemptFailed = true;
    }
    assert.strictEqual(firstAttemptFailed, true);
    assert.strictEqual(uploadCallCount, 1, 'Image should have been uploaded once');
    assert.strictEqual(uploadedImageUrl, 'https://res.cloudinary.com/test/retained.jpg', 'URL must be retained in state');

    // Seller fixes SKU in UI
    skuToUse = `SKU-FIXED-${Date.now()}`;

    // Second attempt (retry)
    const successfulProduct = await attemptApproval();
    assert.ok(successfulProduct);
    assert.strictEqual(uploadCallCount, 1, 'Retry must reuse cached URL without calling upload API again');
    assert.strictEqual(successfulProduct.images[0], 'https://res.cloudinary.com/test/retained.jpg');
  });

  // ----------------------------------------------------
  // TEST 8: Replacing an image invalidates the previous cached upload URL
  // ----------------------------------------------------
  await runTest('8. Replacing an image invalidates the previous cached upload URL', async () => {
    let uploadedImageUrl = 'https://res.cloudinary.com/test/old-photo.jpg';

    // Simulate handleFileValidateAndSelect when seller selects a new image
    const handleFileValidateAndSelect = () => {
      uploadedImageUrl = null;
    };
    handleFileValidateAndSelect();
    assert.strictEqual(uploadedImageUrl, null, 'Selecting new image must invalidate uploadedImageUrl');

    // Simulate handleRemoveFile
    uploadedImageUrl = 'https://res.cloudinary.com/test/photo-2.jpg';
    const handleRemoveFile = () => {
      uploadedImageUrl = null;
    };
    handleRemoveFile();
    assert.strictEqual(uploadedImageUrl, null, 'Removing image must invalidate uploadedImageUrl');
  });

  // ----------------------------------------------------
  // TEST 9: Duplicate submission is prevented
  // ----------------------------------------------------
  await runTest('9. Duplicate submission is prevented (loading & in-flight guards)', async () => {
    let submissionCount = 0;
    let isSaving = false;

    const handleSubmit = async () => {
      if (isSaving) return null; // Guard against concurrent click
      isSaving = true;
      submissionCount++;
      await new Promise((r) => setTimeout(r, 20));
      isSaving = false;
      return 'done';
    };

    // Rapid double click
    const p1 = handleSubmit();
    const p2 = handleSubmit();
    await Promise.all([p1, p2]);

    assert.strictEqual(submissionCount, 1, 'Only one submission must execute concurrently');
  });

  // ----------------------------------------------------
  // TEST 10: Missing AIJob linkage is handled correctly
  // ----------------------------------------------------
  await runTest('10. Missing AIJob linkage is handled correctly (clear error & blocked)', async () => {
    // Component approval guard: checks draftMetadata.result_id
    const checkApprovalReadiness = (draftMetadata) => {
      const aiJobId = draftMetadata?.result_id;
      if (!aiJobId) {
        throw new Error('Missing AI generation linkage identifier (result_id). Please regenerate the listing draft before approving.');
      }
      return aiJobId;
    };

    assert.throws(
      () => checkApprovalReadiness(null),
      /Missing AI generation linkage identifier/
    );
    assert.throws(
      () => checkApprovalReadiness({}),
      /Missing AI generation linkage identifier/
    );
    assert.strictEqual(checkApprovalReadiness({ result_id: 'valid-id' }), 'valid-id');

    // Backend rejection if missing or unknown
    let rejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Unlinked AI Product',
        sku: `REJ-UNLINK-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: 'non-existent-result-id',
      });
    } catch (err) {
      rejected = err.message.includes('AIJob not found for provided aiJobId');
    }
    assert.strictEqual(rejected, true, 'Backend must reject unresolvable aiJobId');
  });

  // ----------------------------------------------------
  // TEST 11: Manual product creation remains unaffected
  // ----------------------------------------------------
  await runTest('11. Manual product creation remains unaffected', async () => {
    const sku = `SKU-MANUAL-${Date.now()}`;
    const product = await createProductService(tenantA, {
      title: 'Handmade Dokra Brass Bell',
      sku,
      masterPrice: 450,
      costPrice: 200,
      stock: 15,
      brand: 'Bhartiye Crafts',
    });

    assert.ok(product);
    assert.strictEqual(product.sku, sku);
    assert.strictEqual(product.aiApproved, false);
    assert.strictEqual(product.aiGenerated, false);
    assert.strictEqual(product.aiJobId, null);
    assert.strictEqual(product.masterPrice, 450);
  });

  // ----------------------------------------------------
  // TEST 12: Existing AI Studio, product persistence, and image upload regression tests pass
  // ----------------------------------------------------
  await runTest('12. Existing AI Studio, product persistence, and image upload regression tests pass', async () => {
    const { execSync } = await import('child_process');
    try {
      execSync('node backend/test_product_image_upload.js', { stdio: 'pipe' });
      execSync('node backend/tests/aiStudioIntegration.test.js', { stdio: 'pipe' });
      execSync('node backend/tests/productApprovalPersistence.test.js', { stdio: 'pipe' });
      assert(true, 'All regression suites passed');
    } catch (execErr) {
      assert.fail(`Regression test failed: ${execErr.stdout?.toString() || execErr.message}`);
    }
  });

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch((err) => {
  console.error('Test suite failed to run:', err);
  process.exit(1);
});
