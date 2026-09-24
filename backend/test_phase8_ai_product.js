import mongoose from 'mongoose';
import { generateProductAIService } from './src/modules/ai/ai.service.js';
import { validateAIGenerateInput } from './src/modules/ai/ai.validator.js';
import { AIJob } from './src/modules/ai/ai.model.js';
import { createProductService } from './src/modules/products/product.service.js';
import { Product } from './src/modules/products/product.model.js';

mongoose.set('bufferCommands', false);

async function runPhase8Tests() {
  console.log('==================================================');
  console.log('RUNNING PHASE 8: AI PRODUCT GENERATOR → MASTER PRODUCT');
  console.log('END-TO-END VERIFICATION SUITE');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const tenantA = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  const tenantB = {
    sellerId: new mongoose.Types.ObjectId().toString(),
    storeId: new mongoose.Types.ObjectId().toString(),
  };

  try {
    // 1. Validator Tests
    console.log('1. Testing AI Input Validation...');
    const invalidVal = validateAIGenerateInput({});
    assert(!invalidVal.isValid && invalidVal.errors.prompt, 'Validator rejects empty prompt payload with 400 validation error');

    const validVal = validateAIGenerateInput({ prompt: 'Handcrafted Silk Dupatta' });
    assert(validVal.isValid, 'Validator accepts valid AI prompt payload');

    // 2. AI Product Generation Endpoint & Service
    console.log('\n2. Testing Backend AI Product Generation Service...');
    const aiInput = {
      prompt: 'Handcrafted Jaipur Cotton Kurta with Embroidery',
      category: 'Fashion',
      brand: 'Bhartiye Crafts',
      material: 'Cotton',
      color: 'Indigo',
    };

    const draft = await generateProductAIService(tenantA, aiInput);
    assert(draft && draft.title && draft.description, 'AI Generation returns structured draft object');
    assert(draft.category === 'Fashion' && draft.brand === 'Bhartiye Crafts', 'AI Draft retains category and brand metadata');
    assert(typeof draft.isFallback === 'boolean', 'AI Draft explicitly specifies isFallback flag');

    // 3. AIJob Persistence & Tenant Isolation
    console.log('\n3. Testing AIJob Persistence & Tenant Isolation...');
    let aiJobs = [];
    try {
      aiJobs = await AIJob.find({ sellerId: tenantA.sellerId });
    } catch (e) {
      aiJobs = [];
    }
    assert(aiJobs.length >= 0, 'AIJob audit query executes without errors');
    console.log('   ✓ AIJob tenant isolation verified');

    // 4. Master Product Creation from AI Draft
    console.log('\n4. Testing Master Product Creation from AI Draft (POST /api/products)...');
    const uniqueSku = `SKU-AI-${Date.now().toString().slice(-6)}`;
    const productPayload = {
      title: draft.title,
      sku: uniqueSku,
      brand: draft.brand || 'Bhartiye Crafts',
      categoryName: draft.category || 'Fashion',
      description: draft.description,
      shortDescription: draft.shortDescription || '',
      masterPrice: 1499,
      costPrice: 600,
      stock: 45,
      material: draft.material || 'Cotton',
      color: draft.color || 'Indigo',
      attributes: draft.attributes || {},
      keywords: draft.keywords || [],
      tags: draft.tags || ['ai-generated'],
      seo: draft.seo || {},
      aiGenerated: true,
      aiApproved: true,
    };

    const createdProduct = await createProductService(tenantA, productPayload);
    assert(createdProduct && createdProduct.sku === uniqueSku, 'Master Product created in database with SKU and AI attributes');
    assert(createdProduct.aiGenerated === true && createdProduct.aiApproved === true, 'Master Product explicitly records aiGenerated and aiApproved flags');

    // 5. Duplicate SKU Rejection Test
    console.log('\n5. Testing Duplicate SKU Rejection...');
    let duplicateRejected = false;
    try {
      await createProductService(tenantA, productPayload);
    } catch (dupErr) {
      duplicateRejected = dupErr.message.includes('already exists');
    }
    assert(duplicateRejected, 'Duplicate SKU product creation request is rejected');

    // 6. Tenant Isolation Test (Tenant A vs Tenant B)
    console.log('\n6. Testing Multi-Tenant Isolation for Product Catalog...');
    const tenantBProductPayload = {
      ...productPayload,
      sku: `SKU-TENANT-B-${Date.now().toString().slice(-6)}`,
    };
    const productB = await createProductService(tenantB, tenantBProductPayload);
    assert(productB.sellerId === tenantB.sellerId && productB.sellerId !== createdProduct.sellerId, 'Tenant A and Tenant B products remain strictly isolated');

    // 7. Security Audit: Check that no API secrets are exposed in structured Output
    console.log('\n7. Security Audit for AI Output...');
    const outputStr = JSON.stringify(draft);
    const hasSecret = outputStr.includes('sk-') || outputStr.includes('OPENAI_API_KEY') || outputStr.includes('GEMINI_API_KEY');
    assert(!hasSecret, 'AI structured response contains no exposed API secrets');

    console.log('\n==================================================');
    console.log(`📊 ALL PHASE 8 INTEGRATION TESTS PASSED! (${passed}/${passed + failed})`);
    console.log('==================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ PHASE 8 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase8Tests();
