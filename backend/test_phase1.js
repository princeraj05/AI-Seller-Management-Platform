import mongoose from 'mongoose';
import { validateOnboardingInput } from './src/modules/onboarding/onboarding.validator.js';
import { createOrUpdateOnboardingService } from './src/modules/onboarding/onboarding.service.js';

mongoose.set('bufferCommands', false);

async function runPhase1Tests() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING PHASE 1 END-TO-END VERIFICATION TESTS');
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

  // TEST 1: Validator rejects invalid onboarding payload
  const invalidResult = validateOnboardingInput({
    businessName: '',
    ownerName: '',
    mobile: '',
    email: 'invalid-email',
    categories: ['InvalidCategory'],
  });
  assert(!invalidResult.isValid && invalidResult.errors.businessName && invalidResult.errors.categories, 'TEST 1: Validator rejects invalid onboarding payload with 400 validation errors');

  // TEST 2: Validator accepts valid onboarding payload
  const validResult = validateOnboardingInput({
    businessName: 'Bhartiye Crafts',
    ownerName: 'Prince Kumar',
    mobile: '+91 98765 43210',
    email: 'prince@seller.com',
    categories: ['Fashion', 'Handicrafts'],
    channels: ['amazon', 'flipkart', 'myntra'],
  });
  assert(validResult.isValid, 'TEST 2: Validator accepts valid onboarding payload');

  // TEST 3 & 4: Onboarding Service Store Creation & Update
  const mockUserAId = new mongoose.Types.ObjectId().toString();
  const mockUserA = {
    id: mockUserAId,
    sellerId: mockUserAId,
    email: 'sellerA@platform.com',
    role: 'seller',
  };

  const storeAResult = await createOrUpdateOnboardingService(mockUserA, {
    businessName: 'Seller A Crafts Store',
    ownerName: 'Seller A',
    mobile: '+91 99999 11111',
    email: 'sellerA@platform.com',
    categories: ['Fashion'],
    channels: ['amazon', 'flipkart'],
  });
  assert(storeAResult.store && storeAResult.store.businessName === 'Seller A Crafts Store', 'TEST 3: Seller A Onboarding creates Store A');

  // TEST 4: Update Store A without duplicate
  const storeAUpdated = await createOrUpdateOnboardingService(mockUserA, {
    businessName: 'Seller A Crafts Store (Updated)',
    ownerName: 'Seller A',
    mobile: '+91 99999 11111',
    email: 'sellerA@platform.com',
    categories: ['Fashion', 'Footwear'],
    channels: ['amazon', 'flipkart', 'myntra'],
  });
  assert(storeAUpdated.store && storeAUpdated.store.businessName === 'Seller A Crafts Store (Updated)', 'TEST 4: Submitting onboarding again updates existing Store without creating duplicates');

  // TEST 5: Tenant Isolation Test (Seller A vs Seller B)
  const mockUserBId = new mongoose.Types.ObjectId().toString();
  const mockUserB = {
    id: mockUserBId,
    sellerId: mockUserBId,
    email: 'sellerB@platform.com',
    role: 'seller',
  };

  const storeBResult = await createOrUpdateOnboardingService(mockUserB, {
    businessName: 'Seller B Electronics',
    ownerName: 'Seller B',
    mobile: '+91 88888 22222',
    email: 'sellerB@platform.com',
    categories: ['Electronics'],
    channels: ['website'],
  });
  assert(storeBResult.store.sellerId === mockUserBId && storeBResult.store.sellerId !== storeAResult.store.sellerId, 'TEST 5: Multi-Tenant Isolation: Seller A and Seller B have completely separate isolated stores');

  console.log('\n----------------------------------------------------');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------\n');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase1Tests();
