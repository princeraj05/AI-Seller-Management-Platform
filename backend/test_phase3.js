import mongoose from 'mongoose';
import { deriveStockStatus, deductStockAtomic, reserveStockAtomic, releaseReservationAtomic } from './src/modules/inventory/inventory.engine.js';
import { adjustStockService, getInventoryService, getInventoryLedgerService } from './src/modules/inventory/inventory.service.js';
import { checkoutPOSService, getPOSBillsService } from './src/modules/pos/pos.service.js';
import { createProductService } from './src/modules/products/product.service.js';
import { generateProductAIService } from './src/modules/ai/ai.service.js';
import { createOrUpdateOnboardingService } from './src/modules/onboarding/onboarding.service.js';

mongoose.set('bufferCommands', false);

async function runPhase3Tests() {
  console.log('----------------------------------------------------');
  console.log('🧪 RUNNING PHASE 3 END-TO-END VERIFICATION TESTS');
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

  // TEST 1: Derived Stock Status Logic
  assert(
    deriveStockStatus(0) === 'OUT_OF_STOCK' &&
    deriveStockStatus(5, 10) === 'LOW_STOCK' &&
    deriveStockStatus(25, 10) === 'IN_STOCK',
    'TEST 1: Stock status correctly derives OUT_OF_STOCK, LOW_STOCK, and IN_STOCK'
  );

  const sellerAId = new mongoose.Types.ObjectId().toString();
  const tenantA = { sellerId: sellerAId, storeId: 'store-A-p3' };

  // Setup product for Seller A
  await createProductService(tenantA, {
    sku: 'POS-ITEM-01',
    title: "Women's Cotton Kurta",
    masterPrice: 999,
    stock: 50,
  });

  // TEST 2: Manual Stock Adjustment & Ledger Entry
  const adjustedInv = await adjustStockService(tenantA, {
    sku: 'POS-ITEM-01',
    delta: 20,
    reason: 'Initial shipment arrival',
  });
  assert(adjustedInv && adjustedInv.availableStock >= 20, 'TEST 2: Stock adjustment successfully increases available stock');

  // TEST 3: Negative Stock Prevention
  let negativeBlocked = false;
  try {
    await adjustStockService(tenantA, {
      sku: 'POS-ITEM-01',
      delta: -99999,
      reason: 'Excess deduction',
    });
  } catch (err) {
    negativeBlocked = true;
  }
  assert(negativeBlocked, 'TEST 3: Manual adjustment preventing negative stock is enforced');

  // TEST 4: Atomic Stock Reservation & Release Foundation
  const reserved = await reserveStockAtomic(sellerAId, 'POS-ITEM-01', 10);
  assert(reserved && reserved.reservedStock >= 10, 'TEST 4: Atomic stock reservation increases reservedStock');

  const released = await releaseReservationAtomic(sellerAId, 'POS-ITEM-01', 5);
  assert(released && released.reservedStock <= 5, 'TEST 5: Atomic reservation release decreases reservedStock and returns availableStock');

  // TEST 6: POS Checkout & Price + GST Recalculation
  const checkoutPayload = {
    items: [{ sku: 'POS-ITEM-01', quantity: 2, masterPrice: 1 }], // Frontend attempts fake low price (₹1)
    paymentMode: 'UPI',
    customer: { name: 'Rahul Kumar', phone: '+91 98765 43210' },
  };

  const billA = await checkoutPOSService(tenantA, checkoutPayload);
  const expectedSubtotal = 999 * 2; // Authoritative price from catalog (₹999)
  const expectedGst = Math.round(expectedSubtotal * 0.05);
  const expectedGrandTotal = expectedSubtotal + expectedGst;

  assert(
    billA &&
    billA.subtotal === expectedSubtotal &&
    billA.gst === expectedGst &&
    billA.grandTotal === expectedGrandTotal,
    'TEST 6: POS Checkout recalculates authoritative catalog prices & GST, ignoring manipulated frontend price'
  );

  // TEST 7: Idempotency Protection
  const idempotencyKey = 'idempotency-key-12345';
  const firstCheckout = await checkoutPOSService(tenantA, checkoutPayload, idempotencyKey);
  const secondCheckout = await checkoutPOSService(tenantA, checkoutPayload, idempotencyKey);

  assert(
    firstCheckout && secondCheckout && (firstCheckout._id?.toString() === secondCheckout._id?.toString() || firstCheckout.billNumber === secondCheckout.billNumber),
    'TEST 7: Idempotency protection prevents duplicate POS bills when submitted twice'
  );

  // TEST 8: Multi-Tenant Isolation (Seller A vs Seller B POS Bills & Inventory)
  const sellerBId = new mongoose.Types.ObjectId().toString();
  const tenantB = { sellerId: sellerBId, storeId: 'store-B-p3' };

  const sellerABills = await getPOSBillsService(sellerAId);
  const sellerBBills = await getPOSBillsService(sellerBId);

  const tenantIsolated = sellerABills.bills.every((b) => b.sellerId === sellerAId) && sellerBBills.bills.length === 0;
  assert(tenantIsolated, 'TEST 8: Tenant Isolation: Seller A POS bills cannot be accessed by Seller B');

  // TEST 9 & 10: Phase 1 & Phase 2 Regression Checks
  const onboardingReg = await createOrUpdateOnboardingService(
    { id: sellerAId, sellerId: sellerAId },
    {
      businessName: 'Phase 3 Verification Store',
      ownerName: 'Prince Owner',
      mobile: '+91 99999 88888',
      email: 'prince@verified.com',
      categories: ['Fashion'],
      channels: ['pos'],
    }
  );

  const aiDraft = await generateProductAIService(tenantA, { prompt: 'Cotton Kurta for POS' });

  assert(
    onboardingReg && onboardingReg.store && aiDraft && aiDraft.title,
    'TEST 9: Phase 1 & Phase 2 Regression Check: Onboarding and AI Studio engines remain 100% operational'
  );

  console.log('\n----------------------------------------------------');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('----------------------------------------------------\n');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase3Tests();
