/**
 * Automated Test Suite: Product Schema and Persistence Service Enhancement (Phase 03.4.1)
 *
 * Verifies:
 * 1. Manual product creation remains functional.
 * 2. AI-generated product fields persist correctly.
 * 3. Bullet points are stored and bounded.
 * 4. Product type and subcategory are stored.
 * 5. SEO fields are preserved (title, description, keywords, slug).
 * 6. Attributes remain a Map of String.
 * 7. Valid AIJob linkage succeeds and records aiJobId.
 * 8. Missing or invalid AIJob linkage is rejected for AI-approved products.
 * 9. Cross-tenant AIJob linkage is rejected.
 * 10. Client-supplied aiApproved cannot bypass backend approval policy.
 * 11. Seller/store identity remains server-derived.
 * 12. Duplicate SKU rejection still works.
 * 13. Negative prices and stock remain rejected.
 * 14. Existing Product creation tests continue passing.
 * 15. Matching seller and matching store succeeds.
 * 16. Store-specific AIJob with missing request storeId is rejected.
 * 17. Store-specific AIJob with different request storeId is rejected.
 * 18. Store-less AIJob with store-specific request is rejected.
 * 19. Both job and request without storeId remain compatible.
 * 20. In-memory lookup works in test/development mode.
 * 21. In-memory lookup cannot authorize a product in production.
 * 22. In-memory registration is rejected in production.
 * 23. MongoDB-backed AIJob approval still works in production mode.
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
  console.log('====================================================');
  console.log('PRODUCT SCHEMA & PERSISTENCE VERIFICATION TEST SUITE');
  console.log('Phase 03.4.1: Product Persistence & Security Hardening');
  console.log('====================================================\n');

  const tenantA = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  const tenantB = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  // TEST 1: Manual product creation remains functional
  await runTest('1. Manual product creation remains functional', async () => {
    const sku = `MANUAL-${Date.now()}-1`;
    const product = await createProductService(tenantA, {
      title: 'Handcrafted Blue Pottery Plate',
      sku,
      masterPrice: 850,
      costPrice: 400,
      stock: 25,
      brand: 'Bhartiye Crafts',
      categoryName: 'Home Decor',
    });
    assert(product, 'Product should be created');
    assert.strictEqual(product.sku, sku);
    assert.strictEqual(product.title, 'Handcrafted Blue Pottery Plate');
    assert.strictEqual(product.aiApproved, false, 'Manual product must have aiApproved = false');
    assert.strictEqual(product.aiGenerated, false, 'Manual product must have aiGenerated = false');
    assert.strictEqual(product.aiJobId, null, 'Manual product must have aiJobId = null');
    assert.deepStrictEqual(product.bulletPoints, [], 'Manual product default bullet points');
    assert.strictEqual(product.productType, '');
    assert.strictEqual(product.subcategory, '');
  });

  // TEST 2: AI-generated product fields persist correctly
  await runTest('2. AI-generated product fields persist correctly', async () => {
    const jobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: jobId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
    });

    const sku = `AI-GEN-${Date.now()}-2`;
    const product = await createProductService(tenantA, {
      title: 'Carved Sheesham Wooden Coaster Set',
      sku,
      masterPrice: 650,
      costPrice: 280,
      stock: 50,
      material: 'Sheesham Wood',
      color: 'Walnut Brown',
      bulletPoints: ['Set of 6 handcrafted coasters', 'Water-resistant natural finish'],
      productType: 'Tableware',
      subcategory: 'Coasters',
      seo: {
        title: 'Sheesham Coaster Set',
        description: 'Premium wooden coasters',
        keywords: ['coasters', 'wood'],
        slug: 'carved-sheesham-wooden-coaster-set',
      },
      aiApproved: true,
      aiJobId: jobId,
    });
    assert(product, 'Product should be created');
    assert.strictEqual(product.aiApproved, true);
    assert.strictEqual(product.aiGenerated, true);
    assert.strictEqual(String(product.aiJobId), jobId);
    assert.strictEqual(product.material, 'Sheesham Wood');
    assert.strictEqual(product.color, 'Walnut Brown');
    assert.strictEqual(product.productType, 'Tableware');
    assert.strictEqual(product.subcategory, 'Coasters');
  });

  // TEST 3: Bullet points are stored and bounded
  await runTest('3. Bullet points are stored and bounded', async () => {
    const jobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: jobId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
    });

    const longString = 'A'.repeat(600);
    const oversizedBullets = Array.from({ length: 15 }, (_, i) => `Point ${i + 1}: ${longString}`);

    const sku = `AI-BULLETS-${Date.now()}-3`;
    const product = await createProductService(tenantA, {
      title: 'Embroidered Kashmiri Shawl',
      sku,
      masterPrice: 3200,
      bulletPoints: oversizedBullets,
      aiApproved: true,
      aiJobId: jobId,
    });

    assert(Array.isArray(product.bulletPoints), 'bulletPoints must be an array');
    assert.strictEqual(product.bulletPoints.length, 10, 'bulletPoints must be capped at 10 items');
    assert(product.bulletPoints[0].length <= 500, 'Individual bullet points must not exceed 500 chars');
  });

  // TEST 4: Product type and subcategory are stored
  await runTest('4. Product type and subcategory are stored', async () => {
    const sku = `NORM-${Date.now()}-4`;
    const oversizedType = '  Ethnic Traditional Handcrafted Wear  ' + 'X'.repeat(150);
    const product = await createProductService(tenantA, {
      title: 'Zari Border Banarasi Silk Dupatta',
      sku,
      masterPrice: 1950,
      productType: oversizedType,
      subcategory: '  Stoles & Dupattas  ',
    });
    assert(product.productType.length <= 100, 'productType capped at 100 chars');
    assert.strictEqual(product.subcategory, 'Stoles & Dupattas', 'subcategory trimmed');
  });

  // TEST 5: SEO fields are preserved
  await runTest('5. SEO fields are preserved', async () => {
    const sku = `SEO-${Date.now()}-5`;
    const product = await createProductService(tenantA, {
      title: 'Hand-Hammered Copper Bottle',
      sku,
      masterPrice: 1100,
      seo: {
        title: 'Authentic Pure Copper Water Bottle 1L',
        description: 'Ayurvedic wellness pure copper hammered bottle crafted in India',
        keywords: ['copper bottle', 'ayurvedic', 'handcrafted'],
        slug: 'Authentic Pure Copper Water Bottle 1L',
      },
    });
    assert.strictEqual(product.seo.title, 'Authentic Pure Copper Water Bottle 1L');
    assert.strictEqual(product.seo.description, 'Ayurvedic wellness pure copper hammered bottle crafted in India');
    assert.deepStrictEqual(product.seo.keywords, ['copper bottle', 'ayurvedic', 'handcrafted']);
    assert.strictEqual(product.seo.slug, 'authentic-pure-copper-water-bottle-1l', 'slug should be normalized and lowercased');
  });

  // TEST 6: Attributes remain a Map of String
  await runTest('6. Attributes remain a Map of String', async () => {
    const sku = `ATTR-${Date.now()}-6`;
    const inputAttributes = {
      'Craft': 'Dhokra Metal Casting',
      'Material': 'Bell Metal Brass',
      'Origin': 'Bastar, Chhattisgarh',
    };
    const product = await createProductService(tenantA, {
      title: 'Dhokra Tribal Brass Figurine',
      sku,
      masterPrice: 1800,
      attributes: inputAttributes,
    });

    assert(product.attributes instanceof Map, 'attributes must be a Map instance');
    assert.strictEqual(product.attributes.get('Craft'), 'Dhokra Metal Casting');
    assert.strictEqual(product.attributes.get('Material'), 'Bell Metal Brass');
    assert.strictEqual(product.attributes.get('Origin'), 'Bastar, Chhattisgarh');
  });

  // TEST 7: Valid AIJob linkage succeeds
  await runTest('7. Valid AIJob linkage succeeds', async () => {
    const resultId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const validJob = registerInMemoryAIJob({
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
      input: { result_id: resultId },
      output: { title: 'Authentic Terracotta Planter' },
    });

    const sku = `AI-VALID-${Date.now()}-7`;
    const product = await createProductService(tenantA, {
      title: 'Authentic Terracotta Handpainted Planter',
      sku,
      masterPrice: 450,
      aiApproved: true,
      aiJobId: resultId,
    });

    assert.strictEqual(product.aiApproved, true);
    assert.strictEqual(product.aiGenerated, true);
    assert.strictEqual(String(product.aiJobId), String(validJob._id));
  });

  // TEST 8: Missing or invalid AIJob linkage is rejected for AI-approved products
  await runTest('8. Missing or invalid AIJob linkage is rejected for AI-approved products', async () => {
    // 8a: Missing aiJobId
    let missingRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Unlinked AI Product',
        sku: `REJ-NO-JOB-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
      });
    } catch (err) {
      missingRejected = err.message.includes('AI-approved products require a valid completed AIJob linkage');
    }
    assert(missingRejected, 'Missing aiJobId must be rejected when aiApproved: true');

    // 8b: Invalid / non-existent aiJobId
    let notFoundRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Nonexistent AI Job Product',
        sku: `REJ-NONEXISTENT-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: new mongoose.Types.ObjectId().toString(),
      });
    } catch (err) {
      notFoundRejected = err.message.includes('AIJob not found for provided aiJobId');
    }
    assert(notFoundRejected, 'Non-existent aiJobId must be rejected');

    // 8c: Uncompleted AIJob status
    const pendingJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: pendingJobId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'processing',
    });
    let pendingRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Pending AI Job Product',
        sku: `REJ-PENDING-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: pendingJobId,
      });
    } catch (err) {
      pendingRejected = err.message.includes('Cannot link uncompleted AIJob');
    }
    assert(pendingRejected, 'Pending/uncompleted AIJob must be rejected');

    // 8d: Wrong AIJob type
    const wrongTypeJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: wrongTypeJobId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'chat_assistant',
      status: 'completed',
    });
    let wrongTypeRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Wrong Type AI Job Product',
        sku: `REJ-WRONG-TYPE-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: wrongTypeJobId,
      });
    } catch (err) {
      wrongTypeRejected = err.message.includes('AIJob is not a product generator');
    }
    assert(wrongTypeRejected, 'Non-product_generator AIJob type must be rejected');
  });

  // TEST 9: Cross-tenant AIJob linkage is rejected
  await runTest('9. Cross-tenant AIJob linkage is rejected', async () => {
    // Seller B creates a completed AI job
    const sellerBJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: sellerBJobId,
      sellerId: tenantB.sellerId,
      storeId: tenantB.storeId,
      type: 'product_generator',
      status: 'completed',
    });

    // Seller A attempts to link Seller B's AI job
    let crossTenantRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Spoofed Job Product',
        sku: `REJ-SPOOF-${Date.now()}`,
        masterPrice: 1200,
        aiApproved: true,
        aiJobId: sellerBJobId,
      });
    } catch (err) {
      crossTenantRejected = err.message.includes('AIJob does not belong to authenticated seller');
    }
    assert(crossTenantRejected, 'Seller A must not be allowed to link Seller B AIJob');

    // Store mismatch for same seller
    const storeMismatchJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: storeMismatchJobId,
      sellerId: tenantA.sellerId,
      storeId: 'different-store-id',
      type: 'product_generator',
      status: 'completed',
    });
    let storeMismatchRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Store Mismatch Product',
        sku: `REJ-STORE-MISMATCH-${Date.now()}`,
        masterPrice: 1200,
        aiApproved: true,
        aiJobId: storeMismatchJobId,
      });
    } catch (err) {
      storeMismatchRejected = err.message.includes('AIJob storeId mismatch');
    }
    assert(storeMismatchRejected, 'AIJob with different storeId must be rejected');
  });

  // TEST 10: Client-supplied aiApproved cannot bypass backend approval policy
  await runTest('10. Client-supplied aiApproved cannot bypass backend approval policy', async () => {
    let bypassFailed = false;
    try {
      await createProductService(tenantA, {
        title: 'Malicious Manual Product with aiApproved: true',
        sku: `ATTACK-${Date.now()}-10`,
        masterPrice: 500,
        aiApproved: true,
      });
    } catch (err) {
      bypassFailed = err.message.includes('AI-approved products require a valid completed AIJob linkage');
    }
    assert(bypassFailed, 'Arbitrary client-supplied aiApproved: true without valid AIJob must be blocked');

    const manualProd = await createProductService(tenantA, {
      title: 'Legitimate Manual Product with aiApproved: false',
      sku: `LEGIT-${Date.now()}-10`,
      masterPrice: 500,
      aiApproved: false,
    });
    assert.strictEqual(manualProd.aiApproved, false);
    assert.strictEqual(manualProd.aiGenerated, false);
    assert.strictEqual(manualProd.aiJobId, null);
  });

  // TEST 11: Seller/store identity remains server-derived
  await runTest('11. Seller/store identity remains server-derived', async () => {
    const sku = `SPOOF-TENANT-${Date.now()}-11`;
    const spoofedBody = {
      title: 'Tenant Spoof Attempt Product',
      sku,
      masterPrice: 1500,
      sellerId: 'attacker-seller-999',
      storeId: 'attacker-store-999',
    };
    const product = await createProductService(tenantA, spoofedBody);
    assert.strictEqual(product.sellerId, tenantA.sellerId, 'sellerId must equal tenant context, not request body');
    assert.strictEqual(product.storeId, tenantA.storeId, 'storeId must equal tenant context, not request body');
  });

  // TEST 12: Duplicate SKU rejection still works
  await runTest('12. Duplicate SKU rejection still works', async () => {
    const uniqueSku = `DUP-TEST-${Date.now()}-12`;
    await createProductService(tenantA, {
      title: 'First Product',
      sku: uniqueSku,
      masterPrice: 1000,
    });

    let duplicateRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Second Product With Same SKU',
        sku: uniqueSku,
        masterPrice: 2000,
      });
    } catch (err) {
      duplicateRejected = err.message.includes(`Product with SKU '${uniqueSku}' already exists for this seller.`);
    }
    assert(duplicateRejected, 'Duplicate SKU for same seller must throw duplicate error');
  });

  // TEST 13: Negative prices and stock remain rejected
  await runTest('13. Negative prices and stock remain rejected', async () => {
    // Negative masterPrice
    let negPriceRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Negative Price Product',
        sku: `NEG-P-${Date.now()}-13`,
        masterPrice: -100,
      });
    } catch (err) {
      negPriceRejected = err.message.includes('Valid non-negative master price is required');
    }
    assert(negPriceRejected, 'Negative masterPrice must be rejected');

    // Negative stock
    let negStockRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Negative Stock Product',
        sku: `NEG-S-${Date.now()}-13`,
        masterPrice: 100,
        stock: -5,
      });
    } catch (err) {
      negStockRejected = err.message.includes('Stock cannot be negative');
    }
    assert(negStockRejected, 'Negative stock must be rejected');

    // Negative costPrice
    let negCostRejected = false;
    try {
      await createProductService(tenantA, {
        title: 'Negative Cost Product',
        sku: `NEG-C-${Date.now()}-13`,
        masterPrice: 100,
        costPrice: -20,
      });
    } catch (err) {
      negCostRejected = err.message.includes('Cost price cannot be negative');
    }
    assert(negCostRejected, 'Negative costPrice must be rejected');
  });

  // TEST 14: Existing Product creation tests continue passing
  await runTest('14. Existing Product creation tests continue passing', async () => {
    const { execSync } = await import('child_process');
    try {
      execSync('node backend/test_phase2.js', { stdio: 'pipe' });
      execSync('node backend/test_phase3.js', { stdio: 'pipe' });
      execSync('node backend/test_phase8_ai_product.js', { stdio: 'pipe' });
      assert(true, 'All legacy product creation tests passed');
    } catch (execErr) {
      assert.fail(`Legacy product creation test failed: ${execErr.stdout?.toString() || execErr.message}`);
    }
  });

  // TEST 15: Matching seller and matching store succeeds
  await runTest('15. Matching seller and matching store succeeds', async () => {
    const storeJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: storeJobId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
    });

    const sku = `STORE-MATCH-${Date.now()}`;
    const product = await createProductService(tenantA, {
      title: 'Store Matching Silk Saree',
      sku,
      masterPrice: 1800,
      aiApproved: true,
      aiJobId: storeJobId,
    });

    assert.strictEqual(product.aiApproved, true);
    assert.strictEqual(product.storeId, tenantA.storeId);
  });

  // TEST 16: Store-specific AIJob with missing request storeId is rejected
  await runTest('16. Store-specific AIJob with missing request storeId is rejected', async () => {
    const storeJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: storeJobId,
      sellerId: tenantA.sellerId,
      storeId: 'specific-store-456',
      type: 'product_generator',
      status: 'completed',
    });

    const tenantNoStore = { sellerId: tenantA.sellerId, storeId: null };
    let missingStoreRejected = false;
    try {
      await createProductService(tenantNoStore, {
        title: 'Missing Store Context Attempt',
        sku: `REJ-NOSTORE-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: storeJobId,
      });
    } catch (err) {
      missingStoreRejected = err.message.includes('AIJob storeId mismatch');
    }
    assert(missingStoreRejected, 'Store-scoped AIJob must be rejected when request storeId is missing');
  });

  // TEST 17: Store-specific AIJob with different request storeId is rejected
  await runTest('17. Store-specific AIJob with different request storeId is rejected', async () => {
    const storeJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: storeJobId,
      sellerId: tenantA.sellerId,
      storeId: 'store-alpha',
      type: 'product_generator',
      status: 'completed',
    });

    const tenantDifferentStore = { sellerId: tenantA.sellerId, storeId: 'store-beta' };
    let differentStoreRejected = false;
    try {
      await createProductService(tenantDifferentStore, {
        title: 'Different Store Context Attempt',
        sku: `REJ-DIFFSTORE-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: storeJobId,
      });
    } catch (err) {
      differentStoreRejected = err.message.includes('AIJob storeId mismatch');
    }
    assert(differentStoreRejected, 'Store-scoped AIJob must be rejected when request storeId is different');
  });

  // TEST 18: Store-less AIJob with store-specific request is rejected
  await runTest('18. Store-less AIJob with store-specific request is rejected', async () => {
    const globalJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: globalJobId,
      sellerId: tenantA.sellerId,
      storeId: null,
      type: 'product_generator',
      status: 'completed',
    });

    const tenantWithStore = { sellerId: tenantA.sellerId, storeId: 'store-gamma' };
    let storelessMismatchRejected = false;
    try {
      await createProductService(tenantWithStore, {
        title: 'Store-specific Request for Store-less Job Attempt',
        sku: `REJ-STORELESS-${Date.now()}`,
        masterPrice: 999,
        aiApproved: true,
        aiJobId: globalJobId,
      });
    } catch (err) {
      storelessMismatchRejected = err.message.includes('AIJob storeId mismatch');
    }
    assert(storelessMismatchRejected, 'Store-less AIJob must be rejected when request has a specific storeId');
  });

  // TEST 19: Both job and request without storeId remain compatible
  await runTest('19. Both job and request without storeId remain compatible', async () => {
    const globalJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: globalJobId,
      sellerId: tenantA.sellerId,
      storeId: null,
      type: 'product_generator',
      status: 'completed',
    });

    const tenantNoStore = { sellerId: tenantA.sellerId, storeId: null };
    const sku = `GLOBAL-MATCH-${Date.now()}`;
    const product = await createProductService(tenantNoStore, {
      title: 'Global Storeless Product',
      sku,
      masterPrice: 1100,
      aiApproved: true,
      aiJobId: globalJobId,
    });

    assert.strictEqual(product.aiApproved, true);
    assert.strictEqual(product.storeId, null);
  });

  // TEST 20: In-memory lookup works in test/development mode
  await runTest('20. In-memory lookup works in test/development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const devJobId = new mongoose.Types.ObjectId().toString();
      registerInMemoryAIJob({
        _id: devJobId,
        sellerId: tenantA.sellerId,
        storeId: tenantA.storeId,
        type: 'product_generator',
        status: 'completed',
      });

      const sku = `DEV-MEM-${Date.now()}`;
      const product = await createProductService(tenantA, {
        title: 'Dev In-Memory Product',
        sku,
        masterPrice: 750,
        aiApproved: true,
        aiJobId: devJobId,
      });

      assert.strictEqual(product.aiApproved, true);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // TEST 21: In-memory lookup cannot authorize a product in production
  await runTest('21. In-memory lookup cannot authorize a product in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    // Register in dev mode first
    const memJobId = new mongoose.Types.ObjectId().toString();
    registerInMemoryAIJob({
      _id: memJobId,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      type: 'product_generator',
      status: 'completed',
    });

    try {
      // Switch to production mode
      process.env.NODE_ENV = 'production';
      let prodRejected = false;
      try {
        await createProductService(tenantA, {
          title: 'Production In-Memory Bypass Attempt',
          sku: `PROD-MEM-REJ-${Date.now()}`,
          masterPrice: 999,
          aiApproved: true,
          aiJobId: memJobId,
          images: ['https://res.cloudinary.com/demo/image/upload/v1/prod.jpg'],
        });
      } catch (err) {
        prodRejected = err.message.includes('AIJob not found for provided aiJobId');
      }
      assert(prodRejected, 'In-memory AIJob lookup must be disabled in production environment');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // TEST 22: In-memory registration is rejected in production
  await runTest('22. In-memory registration is rejected in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      let regRejected = false;
      try {
        registerInMemoryAIJob({
          _id: new mongoose.Types.ObjectId().toString(),
          sellerId: tenantA.sellerId,
          storeId: tenantA.storeId,
        });
      } catch (err) {
        regRejected = err.message.includes('In-memory AIJob registration is disabled in production environment');
      }
      assert(regRejected, 'registerInMemoryAIJob must throw in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // TEST 23: MongoDB-backed AIJob approval still works in production mode
  await runTest('23. MongoDB-backed AIJob approval still works in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const dbJobId = new mongoose.Types.ObjectId();
    const originalFindById = AIJob.findById;

    try {
      // Simulate/test MongoDB authoritative query in production mode
      // If MongoDB is offline, stub findById to verify that createProductService
      // accepts and processes the DB-returned record under NODE_ENV === 'production'.
      AIJob.findById = async (id) => {
        if (String(id) === String(dbJobId)) {
          return {
            _id: dbJobId,
            sellerId: tenantA.sellerId,
            storeId: tenantA.storeId,
            type: 'product_generator',
            status: 'completed',
          };
        }
        return null;
      };

      process.env.NODE_ENV = 'production';
      const sku = `PROD-DB-AUTH-${Date.now()}`;
      const product = await createProductService(tenantA, {
        title: 'Production MongoDB Authorized Product',
        sku,
        masterPrice: 2200,
        aiApproved: true,
        aiJobId: dbJobId.toString(),
        images: ['https://res.cloudinary.com/demo/image/upload/v1/prod.jpg'],
      });

      assert.strictEqual(product.aiApproved, true, 'Product must be AI-approved');
      assert.strictEqual(String(product.aiJobId), String(dbJobId), 'aiJobId must equal MongoDB job _id');
    } finally {
      AIJob.findById = originalFindById;
      process.env.NODE_ENV = originalEnv;
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
