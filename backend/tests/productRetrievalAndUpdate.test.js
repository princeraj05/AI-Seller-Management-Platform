/**
 * Automated Test Suite: Product Retrieval Contract & Partial Update Preservation (Phase 03.4.3)
 *
 * Verifies:
 * 1. AI-approved product creation with all 16 supported catalog & AI metadata fields.
 * 2. Retrieval via getProductByIdService() preserves all fields.
 * 3. Retrieval via getProductsService() preserves all fields.
 * 4. Map attributes serialize correctly into plain JSON object representation.
 * 5. Manual products with default/empty AI metadata remain completely backward-compatible.
 * 6. Tenant isolation is strictly enforced on product retrieval.
 * 7. Partial update: updating masterPrice alone preserves all AI metadata.
 * 8. Partial update: updating title alone preserves all AI metadata.
 * 9. Partial update: updating title and stock together preserves all AI metadata.
 * 10. Security: update requests attempting to alter aiApproved or aiJobId are stripped.
 * 11. Security: update requests attempting to alter sellerId or storeId are stripped.
 * 12. Security: cross-tenant update attempts are rejected with unauthorized error.
 *
 * Test Methodology:
 * - Tests execute real backend services (createProductService, getProductByIdService, getProductsService, updateProductService).
 * - Runs with bufferCommands = false. Uses real MongoDB connection if connected, or the authoritative in-memory product/AIJob store when running offline.
 */

import assert from 'assert';
import mongoose from 'mongoose';
import {
  createProductService,
  getProductsService,
  getProductByIdService,
  updateProductService,
  registerInMemoryAIJob,
  inMemoryProductsMap,
  inMemoryAIJobsMap,
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
  console.log('PRODUCT RETRIEVAL & UPDATE PRESERVATION TEST SUITE');
  console.log('Phase 03.4.3: Catalog Retrieval & Metadata Persistence');
  console.log('====================================================\n');

  const sellerAId = new mongoose.Types.ObjectId().toString();
  const storeAId = new mongoose.Types.ObjectId().toString();
  const tenantA = { sellerId: sellerAId, storeId: storeAId };

  const sellerBId = new mongoose.Types.ObjectId().toString();
  const storeBId = new mongoose.Types.ObjectId().toString();
  const tenantB = { sellerId: sellerBId, storeId: storeBId };

  // Setup AI Job for Tenant A
  const aiJobObjectId = new mongoose.Types.ObjectId().toString();
  const resultUuid = `result-uuid-${Date.now()}`;
  const validAiJob = registerInMemoryAIJob({
    _id: aiJobObjectId,
    sellerId: tenantA.sellerId,
    storeId: tenantA.storeId,
    type: 'product_generator',
    status: 'completed',
    input: { result_id: resultUuid },
    output: { title: 'Blue Pottery Floral Vase' },
  });

  const fullAiProductData = {
    title: 'Handcrafted Blue Pottery Ceramic Floral Vase',
    description: 'An authentic Jaipur blue pottery vase meticulously shaped and hand-painted by artisan masters.',
    shortDescription: 'Jaipur handcrafted ceramic vase with traditional Persian floral motifs.',
    brand: 'Bhartiye Crafts Jaipur',
    productType: 'Ceramic Vase',
    categoryName: 'Home Decor',
    subcategory: 'Vases & Planters',
    bulletPoints: [
      'Authentic Jaipur Blue Pottery craft using quartz stone and natural resins',
      'Hand-painted traditional turquoise and cobalt floral motifs',
      'Glazed low-fire ceramic finish suitable for dried floral arrangements',
      'Dimensions: 10 inches height, 4.5 inches diameter',
      'Ethically sourced directly from master craft communities in Rajasthan',
    ],
    keywords: ['blue pottery', 'jaipur craft', 'ceramic vase', 'home decor', 'handmade'],
    attributes: {
      material: 'Quartz Powder & Glass Composite',
      finish: 'Glossy Glazed',
      primary_color: 'Cobalt Blue',
      secondary_color: 'Turquoise',
      craft_style: 'Traditional Persian Floral',
      origin: 'Jaipur, Rajasthan',
    },
    material: 'Quartz Powder & Glass Composite',
    color: 'Cobalt Blue',
    seo: {
      title: 'Handcrafted Blue Pottery Ceramic Floral Vase | Bhartiye Crafts',
      description: 'Buy authentic Jaipur blue pottery floral vases handcrafted by master artisans. Nationwide shipping.',
      keywords: ['blue pottery vase', 'jaipur ceramic decor', 'handmade vase'],
      slug: 'handcrafted-blue-pottery-ceramic-floral-vase',
    },
    sku: `BP-VASE-${Date.now()}`,
    masterPrice: 2450,
    costPrice: 1100,
    stock: 18,
    images: ['https://res.cloudinary.com/bhartiye-crafts/image/upload/v1/products/vase_primary.jpg'],
    aiGenerated: true,
    aiApproved: true,
    aiJobId: resultUuid,
  };

  let createdAiProduct = null;

  // -------------------------------------------------------------------------
  // SECTION 1: Product Retrieval Contract Tests
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: Product Retrieval Contract Tests ---');

  // TEST 1: Create AI-approved product with all 16 supported metadata fields
  await runTest('1. Create AI-approved product with all 16 supported metadata fields', async () => {
    createdAiProduct = await createProductService(tenantA, fullAiProductData);
    assert(createdAiProduct, 'Product must be created');
    assert.strictEqual(createdAiProduct.title, fullAiProductData.title);
    assert.strictEqual(createdAiProduct.aiApproved, true);
    assert.strictEqual(createdAiProduct.aiGenerated, true);
    assert.strictEqual(String(createdAiProduct.aiJobId), String(validAiJob._id));
  });

  // TEST 2: Retrieve product through getProductByIdService() and verify all 16 fields
  await runTest('2. Retrieve product through getProductByIdService() and verify all 16 fields', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    const retrieved = await getProductByIdService(tenantA.sellerId, prodId);

    assert(retrieved, 'Retrieved product must exist');
    assert.strictEqual(retrieved.title, fullAiProductData.title);
    assert.strictEqual(retrieved.description, fullAiProductData.description);
    assert.strictEqual(retrieved.shortDescription, fullAiProductData.shortDescription);
    assert.strictEqual(retrieved.brand, fullAiProductData.brand);
    assert.strictEqual(retrieved.productType, fullAiProductData.productType);
    assert.strictEqual(retrieved.categoryName, fullAiProductData.categoryName);
    assert.strictEqual(retrieved.subcategory, fullAiProductData.subcategory);
    assert.deepStrictEqual(retrieved.bulletPoints, fullAiProductData.bulletPoints);
    assert.deepStrictEqual(retrieved.keywords, fullAiProductData.keywords);
    assert.strictEqual(retrieved.material, fullAiProductData.material);
    assert.strictEqual(retrieved.color, fullAiProductData.color);
    assert.strictEqual(retrieved.seo.title, fullAiProductData.seo.title);
    assert.strictEqual(retrieved.seo.description, fullAiProductData.seo.description);
    assert.strictEqual(retrieved.seo.slug, fullAiProductData.seo.slug);
    assert.deepStrictEqual(retrieved.images, fullAiProductData.images);
    assert.strictEqual(retrieved.aiGenerated, true);
    assert.strictEqual(retrieved.aiApproved, true);
    assert.strictEqual(String(retrieved.aiJobId), String(validAiJob._id));
  });

  // TEST 3: Retrieve product through getProductsService() query listing
  await runTest('3. Retrieve product through getProductsService() query listing', async () => {
    const res = await getProductsService(tenantA.sellerId, { search: fullAiProductData.sku });
    assert(res && Array.isArray(res.products), 'Response must contain products array');
    const item = res.products.find((p) => p.sku === fullAiProductData.sku);
    assert(item, 'Item must be found in catalog listing');
    assert.strictEqual(item.title, fullAiProductData.title);
    assert.strictEqual(item.productType, fullAiProductData.productType);
    assert.strictEqual(item.subcategory, fullAiProductData.subcategory);
    assert.deepStrictEqual(item.bulletPoints, fullAiProductData.bulletPoints);
    assert.strictEqual(item.aiApproved, true);
    assert.strictEqual(item.aiGenerated, true);
  });

  // TEST 4: Map attributes serialize correctly into expected API JSON object representation
  await runTest('4. Map attributes serialize correctly into expected API JSON object representation', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    const retrieved = await getProductByIdService(tenantA.sellerId, prodId);

    // When retrieved or serialized as JSON, attributes must be accessible as key-value pairs
    let attrObj = retrieved.attributes;
    if (attrObj instanceof Map) {
      attrObj = Object.fromEntries(attrObj);
    }
    assert(typeof attrObj === 'object' && attrObj !== null, 'attributes must be an object');
    assert.strictEqual(attrObj.material, 'Quartz Powder & Glass Composite');
    assert.strictEqual(attrObj.craft_style, 'Traditional Persian Floral');
    assert.strictEqual(attrObj.origin, 'Jaipur, Rajasthan');
  });

  // TEST 5: Manual products with empty AI metadata remain completely backward-compatible
  await runTest('5. Manual products with empty AI metadata remain completely backward-compatible', async () => {
    const manualSku = `MANUAL-RET-${Date.now()}`;
    const manualProd = await createProductService(tenantA, {
      title: 'Simple Handspun Cotton Dupatta',
      sku: manualSku,
      masterPrice: 890,
      stock: 40,
    });

    const prodId = manualProd._id || manualProd.id;
    const retrieved = await getProductByIdService(tenantA.sellerId, prodId);
    assert(retrieved, 'Manual product must be retrievable');
    assert.strictEqual(retrieved.sku, manualSku);
    assert.strictEqual(retrieved.aiApproved, false);
    assert.strictEqual(retrieved.aiGenerated, false);
    assert.strictEqual(retrieved.aiJobId, null);
    assert.deepStrictEqual(retrieved.bulletPoints, []);
    assert.strictEqual(retrieved.productType, '');
    assert.strictEqual(retrieved.subcategory, '');
  });

  // TEST 6: Tenant isolation is strictly enforced on product retrieval
  await runTest('6. Tenant isolation is strictly enforced on product retrieval', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    let accessDenied = false;
    try {
      await getProductByIdService(tenantB.sellerId, prodId);
    } catch (err) {
      accessDenied = err.message.includes('Product not found or unauthorized');
    }
    assert(accessDenied, 'Seller B must not be able to retrieve Seller A product');
  });

  // -------------------------------------------------------------------------
  // SECTION 2: Partial Update Preservation Tests
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Partial Update Preservation Tests ---');

  // TEST 7: Update only masterPrice — all AI metadata fields remain unchanged
  await runTest('7. Update only masterPrice — all AI metadata fields remain unchanged', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    const updated = await updateProductService(tenantA.sellerId, prodId, {
      masterPrice: 2800,
    });

    assert.strictEqual(updated.masterPrice, 2800, 'masterPrice must be updated');
    // Verify untouched AI metadata
    assert.strictEqual(updated.title, fullAiProductData.title);
    assert.strictEqual(updated.description, fullAiProductData.description);
    assert.strictEqual(updated.productType, fullAiProductData.productType);
    assert.strictEqual(updated.subcategory, fullAiProductData.subcategory);
    assert.deepStrictEqual(updated.bulletPoints, fullAiProductData.bulletPoints);
    assert.strictEqual(updated.seo.slug, fullAiProductData.seo.slug);
    assert.deepStrictEqual(updated.images, fullAiProductData.images);
    assert.strictEqual(updated.aiApproved, true, 'aiApproved must remain true');
    assert.strictEqual(updated.aiGenerated, true, 'aiGenerated must remain true');
    assert.strictEqual(String(updated.aiJobId), String(validAiJob._id), 'aiJobId must remain unchanged');
  });

  // TEST 8: Update only title — all AI metadata fields remain unchanged
  await runTest('8. Update only title — all AI metadata fields remain unchanged', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    const newTitle = 'Jaipur Royal Blue Pottery Ceramic Floral Vase (Limited Edition)';
    const updated = await updateProductService(tenantA.sellerId, prodId, {
      title: newTitle,
    });

    assert.strictEqual(updated.title, newTitle, 'Title must be updated');
    // Verify untouched fields
    assert.strictEqual(updated.masterPrice, 2800);
    assert.strictEqual(updated.productType, fullAiProductData.productType);
    assert.strictEqual(updated.subcategory, fullAiProductData.subcategory);
    assert.deepStrictEqual(updated.bulletPoints, fullAiProductData.bulletPoints);
    assert.strictEqual(updated.seo.slug, fullAiProductData.seo.slug);
    assert.strictEqual(updated.aiApproved, true);
    assert.strictEqual(updated.aiGenerated, true);
    assert.strictEqual(String(updated.aiJobId), String(validAiJob._id));
  });

  // TEST 9: Update title and stock together — verify both update while AI metadata remains intact
  await runTest('9. Update title and stock together — verify both update while AI metadata remains intact', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    const newTitle = 'Jaipur Royal Blue Pottery Ceramic Floral Vase (Restocked)';
    const updated = await updateProductService(tenantA.sellerId, prodId, {
      title: newTitle,
      stock: 50,
    });

    assert.strictEqual(updated.title, newTitle);
    assert.strictEqual(updated.stock, 50);
    assert.strictEqual(updated.productType, fullAiProductData.productType);
    assert.strictEqual(updated.subcategory, fullAiProductData.subcategory);
    assert.deepStrictEqual(updated.bulletPoints, fullAiProductData.bulletPoints);
    assert.strictEqual(updated.aiApproved, true);
    assert.strictEqual(updated.aiGenerated, true);
    assert.strictEqual(String(updated.aiJobId), String(validAiJob._id));
  });

  // TEST 10: Security: update requests attempting to alter aiApproved or aiJobId are stripped
  await runTest('10. Security: update requests attempting to alter aiApproved or aiJobId are stripped', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    const fakeJobId = new mongoose.Types.ObjectId().toString();

    // Client attempts to demote or tamper with aiApproved and aiJobId
    const updated = await updateProductService(tenantA.sellerId, prodId, {
      masterPrice: 2900,
      aiApproved: false,
      aiJobId: fakeJobId,
    });

    assert.strictEqual(updated.masterPrice, 2900);
    assert.strictEqual(updated.aiApproved, true, 'aiApproved must NOT be modified by client updateData');
    assert.strictEqual(String(updated.aiJobId), String(validAiJob._id), 'aiJobId must NOT be modified by client updateData');
  });

  // TEST 11: Security: update requests attempting to alter sellerId or storeId are stripped
  await runTest('11. Security: update requests attempting to alter sellerId or storeId are stripped', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;

    // Attacker attempts to change ownership of the product
    const updated = await updateProductService(tenantA.sellerId, prodId, {
      title: 'Attacker Reassigned Product',
      sellerId: 'attacker-seller-999',
      storeId: 'attacker-store-999',
    });

    assert.strictEqual(updated.sellerId, tenantA.sellerId, 'sellerId must remain equal to original seller');
    assert.strictEqual(updated.storeId, tenantA.storeId, 'storeId must remain equal to original store');
  });

  // TEST 12: Security: cross-tenant update attempts are rejected with unauthorized error
  await runTest('12. Security: cross-tenant update attempts are rejected with unauthorized error', async () => {
    const prodId = createdAiProduct._id || createdAiProduct.id;
    let unauthorizedUpdateBlocked = false;
    try {
      await updateProductService(tenantB.sellerId, prodId, {
        masterPrice: 99,
      });
    } catch (err) {
      unauthorizedUpdateBlocked = err.message.includes('Product not found or unauthorized');
    }
    assert(unauthorizedUpdateBlocked, 'Cross-tenant update must be rejected with unauthorized error');
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
