import mongoose from 'mongoose';
import { validateProductInput } from './src/modules/products/product.validator.js';
import {
  createProductService,
  getProductsService,
  getProductByIdService,
  updateProductService,
  deleteProductService,
} from './src/modules/products/product.service.js';
import { validateVariantInput } from './src/modules/products/productVariant.validator.js';
import { validateAIGenerateInput } from './src/modules/ai/ai.validator.js';
import { generateProductAIService } from './src/modules/ai/ai.service.js';
import { createOrUpdateOnboardingService } from './src/modules/onboarding/onboarding.service.js';

mongoose.set('bufferCommands', false);

async function runPhase2Tests() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING PHASE 2 END-TO-END VERIFICATION TESTS');
  console.log('----------------------------------------------------\n');

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

  // TEST 1: Product Validator (Invalid Input)
  const invalidProd = validateProductInput({ title: '', sku: '', masterPrice: -10 });
  assert(!invalidProd.isValid && invalidProd.errors.title && invalidProd.errors.sku && invalidProd.errors.masterPrice, 'TEST 1: Product validator rejects invalid product payload');

  // TEST 2: Product Validator (Valid Input)
  const validProd = validateProductInput({ title: "Women's Cotton Kurta", sku: 'KUR-001', masterPrice: 999 });
  assert(validProd.isValid, 'TEST 2: Product validator accepts valid product payload');

  // TEST 3: Seller A Product Creation
  const sellerAId = new mongoose.Types.ObjectId().toString();
  const tenantA = { sellerId: sellerAId, storeId: 'store-A' };

  const prodA = await createProductService(tenantA, {
    sku: 'SKU-A100',
    title: 'Seller A Silk Saree',
    categoryName: 'Fashion',
    masterPrice: 1999,
  });
  assert(prodA && prodA.sku === 'SKU-A100', 'TEST 3: Seller A successfully creates Product A');

  // TEST 4: SKU Uniqueness Isolation (Seller B creates same SKU-A100 allowed)
  const sellerBId = new mongoose.Types.ObjectId().toString();
  const tenantB = { sellerId: sellerBId, storeId: 'store-B' };

  const prodB = await createProductService(tenantB, {
    sku: 'SKU-A100',
    title: 'Seller B Saree With Same SKU',
    categoryName: 'Fashion',
    masterPrice: 2499,
  });
  assert(prodB && prodB.sku === 'SKU-A100' && prodB.sellerId === sellerBId, 'TEST 4: SKU Uniqueness is tenant-scoped (Seller B can use SKU-A100)');

  // TEST 5: Duplicate SKU for same seller rejected
  let duplicateFailed = false;
  try {
    await createProductService(tenantA, {
      sku: 'SKU-A100',
      title: 'Duplicate SKU for Seller A',
      masterPrice: 1500,
    });
  } catch (err) {
    duplicateFailed = true;
  }
  assert(duplicateFailed, 'TEST 5: Duplicate SKU for the SAME seller is rejected');

  // TEST 6: Tenant Isolation on Product Listing
  const sellerAProducts = await getProductsService(sellerAId);
  const sellerBProducts = await getProductsService(sellerBId);

  const hasOnlyA = sellerAProducts.products.every((p) => p.sellerId === sellerAId);
  const hasOnlyB = sellerBProducts.products.every((p) => p.sellerId === sellerBId);
  assert(hasOnlyA && hasOnlyB && sellerAProducts.products.length >= 1, 'TEST 6: Tenant Isolation: GetProducts returns ONLY the authenticated seller products');

  // TEST 7: Cross-tenant access denied
  let crossAccessBlocked = false;
  try {
    await getProductByIdService(sellerAId, prodB._id || prodB.id);
  } catch (err) {
    crossAccessBlocked = true;
  }
  assert(crossAccessBlocked, 'TEST 7: Cross-Tenant Access Control: Seller A cannot access Seller B product by ID');

  // TEST 8: Variant Validator
  const validVariant = validateVariantInput({ sku: 'VAR-001', price: 499 });
  assert(validVariant.isValid, 'TEST 8: Variant validator accepts valid variant payload');

  // TEST 9: AI Input Validator
  const validAI = validateAIGenerateInput({ prompt: 'Create ethnic silk lehenga' });
  assert(validAI.isValid, 'TEST 9: AI validator accepts valid prompt input');

  // TEST 10: AI Studio Generation & Secret Key Secrecy
  const aiDraft = await generateProductAIService(tenantA, { prompt: 'Handmade Bamboo Basket', category: 'Home Decor' });
  const keyExposed = JSON.stringify(aiDraft).includes('sk-proj-');
  assert(aiDraft && aiDraft.title && !keyExposed, 'TEST 10: AI Studio generates structured draft and NEVER exposes OpenAI API key');

  // TEST 11: Phase 1 Regression Check (Onboarding Service still works)
  const onboardingReg = await createOrUpdateOnboardingService(
    { id: sellerAId, sellerId: sellerAId },
    {
      businessName: 'Seller A Heritage Crafts',
      ownerName: 'Seller A Owner',
      mobile: '+91 99999 00000',
      email: 'sellerA@heritage.com',
      categories: ['Handicrafts'],
      channels: ['amazon', 'flipkart'],
    }
  );
  assert(onboardingReg && onboardingReg.store.businessName === 'Seller A Heritage Crafts', 'TEST 11: Phase 1 Regression Check: Onboarding & Store service remains fully functional');

  console.log('\n----------------------------------------------------');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------\n');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase2Tests();
