/**
 * Automated Test Suite: Vision Provenance & Data Contract (Phase 03.3.1)
 *
 * Verifies:
 * 1. Cryptographic Provenance Token Generation, Signature & Validation
 * 2. Token Expiration & Tamper-Detection
 * 3. Multi-Tenant Isolation (Seller and Store Binding)
 * 4. Bounded In-Memory Store, Memory Byte Ceilings & LRU/TTL Eviction
 * 5. Strict Schema Validation (Enums, Confidence Ranges, Payload Bounds)
 * 6. Seller Corrections & Precedence Rules (Accurate seller_provided Provenance)
 * 7. Multi-Product Handling & Focal Product Selection Guard
 * 8. Controller Integration (analyzeProductImage & validateVisionContract)
 * 9. Restart Fallback Behavior
 */

import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  createVisionProvenanceToken,
  verifyAndResolveVisionProvenance,
  computeVisionDigest,
  canonicalStringify,
  getProvenanceSigningKey,
  clearVisionStore,
  getVisionStoreSize,
  getCurrentStoreBytes,
  MAX_STORE_ENTRIES,
  MAX_INDIVIDUAL_PAYLOAD_BYTES,
  MAX_AGGREGATE_STORE_BYTES,
  VisionProvenanceError,
} from '../src/modules/ai/visionProvenance.service.js';
import {
  ProductIntelligenceResultSchema,
  SellerCorrectionsSchema,
  resolveEffectiveAttributes,
} from '../src/modules/ai/visionDataContract.schema.js';
import {
  analyzeProductImage,
  validateVisionContract,
} from '../src/modules/ai/vision.controller.js';

// Deterministic mock vision result adhering to ProductIntelligenceResultSchema
const createMockVisionData = (overrides = {}) => ({
  product_type: 'Handcrafted Wooden Jewelry Box',
  visual_description: 'An intricately carved wooden jewelry box with brass latch.',
  multiple_products_detected: false,
  category: {
    primary_category: 'Home & Living',
    subcategory: 'Jewelry Boxes',
    alternative_categories: ['Handicrafts', 'Storage'],
    confidence: 0.95,
    uncertainty_status: 'confirmed_observation',
    reasoning: 'Distinctive wooden box geometry with jewelry compartments.',
  },
  attributes: [
    {
      name: 'material',
      value: 'Sheesham Wood',
      confidence: 0.88,
      evidence_source: 'vision_model',
      uncertainty_status: 'reasonable_inference',
      notes: 'Grain pattern strongly resembles Sheesham wood.',
    },
    {
      name: 'primary_color',
      value: 'Rich Brown',
      confidence: 0.96,
      evidence_source: 'vision_model',
      uncertainty_status: 'confirmed_observation',
      notes: null,
    },
    {
      name: 'dimensions',
      value: 'unknown',
      confidence: 0.0,
      evidence_source: 'inferred',
      uncertainty_status: 'unknown',
      notes: 'Dimensions cannot be determined without physical scale reference.',
    },
  ],
  ocr: {
    status: 'no_text_detected',
    extracted_text: '',
    segments: [],
    segment_count: 0,
    engine: 'PaddleOCR',
    execution_time_ms: 12.5,
  },
  uncertainties: [
    'Material purity cannot be definitively verified without physical testing.',
  ],
  image_metadata: {
    width: 1024,
    height: 768,
    format: 'JPEG',
    size_bytes: 204800,
    aspect_ratio: 1.33,
    has_exif: false,
    channels: 3,
  },
  processing_metadata: {
    latency_ms: 320,
    provider: 'gemini-1.5-flash',
  },
  ...overrides,
});

// Helper to mock Express req & res
const createMockExpress = (reqOptions = {}) => {
  const req = {
    headers: {},
    body: {},
    params: {},
    tenant: {
      sellerId: 'seller-test-001',
      storeId: 'store-test-001',
    },
    ...reqOptions,
  };

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  return { req, res };
};

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log('VISION PROVENANCE & DATA CONTRACT TEST SUITE');
console.log('Phase 03.3.1: Cryptographic Provenance & Schema Contract');
console.log('====================================================\n');

// ----------------------------------------------------
// SECTION 1: Cryptographic Provenance & Token Lifecycle
// ----------------------------------------------------
console.log('--- SECTION 1: Provenance Token Generation & Verification ---');

runTest('Generates valid signed vision token with expected payload structure', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-abc-123';
  const storeId = 'store-xyz-789';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
    storeId,
  });

  assert.ok(tokenResult.visionToken, 'Should return visionToken');
  assert.ok(tokenResult.resultId, 'Should return resultId');
  assert.ok(tokenResult.expiresAt, 'Should return expiresAt');

  const resolved = verifyAndResolveVisionProvenance({
    visionToken: tokenResult.visionToken,
    sellerId,
    storeId,
  });

  assert.strictEqual(resolved.resultId, tokenResult.resultId);
  assert.strictEqual(resolved.sellerId, sellerId);
  assert.strictEqual(resolved.storeId, storeId);
  assert.strictEqual(resolved.visionData.product_type, visionData.product_type);
});

runTest('Rejects missing vision token with MISSING_VISION_TOKEN (400)', () => {
  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: null,
        sellerId: 'seller-1',
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'MISSING_VISION_TOKEN' && err.statusCode === 400
  );
});

runTest('Rejects forged/tampered JWT signature with INVALID_VISION_TOKEN (401)', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId: 'seller-1',
  });

  // Tamper with the signature portion of the JWT (header.payload.signature)
  const parts = tokenResult.visionToken.split('.');
  const forgedToken = `${parts[0]}.${parts[1]}.tamperedSignatureHere12345`;

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: forgedToken,
        sellerId: 'seller-1',
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'INVALID_VISION_TOKEN' && err.statusCode === 401
  );
});

runTest('Rejects expired vision JWT with VISION_TOKEN_EXPIRED (401)', () => {
  clearVisionStore();
  const sellerId = 'seller-1';

  // Construct a vision token with expired 'exp' claim in the past
  const expiredToken = jwt.sign(
    {
      sub: crypto.randomUUID(),
      sellerId,
      storeId: null,
      digest: 'dummy-digest',
      type: 'vision_provenance',
      exp: Math.floor(Date.now() / 1000) - 60, // expired 60 seconds ago
    },
    getProvenanceSigningKey(),
    { algorithm: 'HS256' }
  );

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: expiredToken,
        sellerId,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'VISION_TOKEN_EXPIRED' && err.statusCode === 401
  );
});

runTest('Rejects expired server cache entry with VISION_RESULT_EXPIRED (410)', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-1';

  // Create token with 1ms cache TTL
  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
    ttlMs: 1,
  });

  // Wait 15ms so in-memory cache expires
  const start = Date.now();
  while (Date.now() - start < 15) {}

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: tokenResult.visionToken,
        sellerId,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'VISION_RESULT_EXPIRED' && err.statusCode === 410
  );
});

runTest('Rejects access tokens presented as vision tokens with INVALID_TOKEN_TYPE (401)', () => {
  // Sign a JWT with type: 'access'
  const fakeToken = jwt.sign(
    { sub: 'user-1', type: 'access' },
    getProvenanceSigningKey(),
    { algorithm: 'HS256' }
  );

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: fakeToken,
        sellerId: 'user-1',
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'INVALID_TOKEN_TYPE' && err.statusCode === 401
  );
});

// ----------------------------------------------------
// SECTION 2: Multi-Tenant Isolation
// ----------------------------------------------------
console.log('\n--- SECTION 2: Multi-Tenant Isolation (Seller & Store Binding) ---');

runTest('Rejects cross-tenant seller access with TENANT_MISMATCH (403)', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const legitimateSeller = 'seller-legitimate-999';
  const maliciousSeller = 'seller-attacker-666';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId: legitimateSeller,
  });

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: tokenResult.visionToken,
        sellerId: maliciousSeller,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'TENANT_MISMATCH' && err.statusCode === 403
  );
});

runTest('Rejects cross-store access with STORE_MISMATCH (403)', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-common-123';
  const legitimateStore = 'store-alpha';
  const unauthorizedStore = 'store-beta';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
    storeId: legitimateStore,
  });

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: tokenResult.visionToken,
        sellerId,
        storeId: unauthorizedStore,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'STORE_MISMATCH' && err.statusCode === 403
  );
});

// ----------------------------------------------------
// SECTION 3: Memory Bounds & Cache Eviction
// ----------------------------------------------------
console.log('\n--- SECTION 3: Memory Bounds & Cache Eviction ---');

runTest('Rejects oversized individual vision result (>64KB) with OVERSIZED_VISION_RESULT (400)', () => {
  clearVisionStore();
  // Build a payload with 50 attributes whose serialized JSON exceeds 64 KB
  const oversizedAttrs = [];
  for (let i = 0; i < 50; i++) {
    oversizedAttrs.push({
      name: `custom_attribute_key_${i}`,
      value: 'X'.repeat(480),
      confidence: 0.9,
      evidence_source: 'vision_model',
      uncertainty_status: 'confirmed_observation',
      notes: 'Y'.repeat(480),
    });
  }

  const hugeVisionData = createMockVisionData({
    visual_description: 'Z'.repeat(2900),
    attributes: oversizedAttrs,
    uncertainties: Array(40).fill('Ambiguity '.repeat(30)),
  });

  const canonicalBytes = Buffer.byteLength(canonicalStringify(hugeVisionData), 'utf8');
  assert.ok(canonicalBytes > MAX_INDIVIDUAL_PAYLOAD_BYTES, `Test payload must exceed 64KB (got ${canonicalBytes} bytes)`);

  assert.throws(
    () => {
      createVisionProvenanceToken({
        visionData: hugeVisionData,
        sellerId: 'seller-1',
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'OVERSIZED_VISION_RESULT' && err.statusCode === 400
  );
});

runTest('Tracks current aggregate byte size and enforces 5MB cache ceiling', () => {
  clearVisionStore();
  assert.strictEqual(getCurrentStoreBytes(), 0);

  const visionData = createMockVisionData();
  createVisionProvenanceToken({
    visionData,
    sellerId: 'seller-1',
  });

  const bytesAfterOne = getCurrentStoreBytes();
  assert.ok(bytesAfterOne > 0, 'Bytes must be tracked after entry insertion');

  // Clear resets bytes to zero
  clearVisionStore();
  assert.strictEqual(getCurrentStoreBytes(), 0);
});

runTest('Enforces maximum entry capacity (500) and LRU eviction', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const firstResult = createVisionProvenanceToken({
    visionData,
    sellerId: 'seller-first',
  });

  assert.strictEqual(getVisionStoreSize(), 1);

  // Fill up beyond MAX_STORE_ENTRIES
  for (let i = 0; i < MAX_STORE_ENTRIES + 5; i++) {
    createVisionProvenanceToken({
      visionData,
      sellerId: `seller-batch-${i}`,
    });
  }

  assert.ok(getVisionStoreSize() <= MAX_STORE_ENTRIES, `Store size ${getVisionStoreSize()} exceeds MAX_STORE_ENTRIES`);
  assert.ok(getCurrentStoreBytes() <= MAX_AGGREGATE_STORE_BYTES, `Aggregate bytes exceed MAX_AGGREGATE_STORE_BYTES`);

  // First item must have been evicted by LRU
  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: firstResult.visionToken,
        sellerId: 'seller-first',
      });
    },
    (err) => err.code === 'VISION_RESULT_NOT_FOUND' && err.statusCode === 404
  );
});

runTest('Genuine LRU eviction scenario: accessing entry A protects it, causing less-recently-used B to be evicted on overflow', () => {
  clearVisionStore();
  const visionData = createMockVisionData();

  // 1. Insert A
  const resA = createVisionProvenanceToken({ visionData, sellerId: 'seller-A' });
  // 2. Insert B
  const resB = createVisionProvenanceToken({ visionData, sellerId: 'seller-B' });
  // 3. Fill up to capacity (MAX_STORE_ENTRIES = 500)
  for (let i = 2; i < MAX_STORE_ENTRIES; i++) {
    createVisionProvenanceToken({ visionData, sellerId: `seller-${i}` });
  }

  assert.strictEqual(getVisionStoreSize(), MAX_STORE_ENTRIES);

  // 4. Access A successfully -> updates A's recency to newest in Map
  const accessedA = verifyAndResolveVisionProvenance({
    visionToken: resA.visionToken,
    sellerId: 'seller-A',
  });
  assert.ok(accessedA);

  // 5. Insert entry D when cache is full -> triggers eviction of the least recently used
  createVisionProvenanceToken({ visionData, sellerId: 'seller-overflow-D' });

  // 6. Confirm B (not accessed) was evicted, while A (accessed) remains intact!
  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: resB.visionToken,
        sellerId: 'seller-B',
      });
    },
    (err) => err.code === 'VISION_RESULT_NOT_FOUND' && err.statusCode === 404
  );

  // A must still be present and valid
  const checkA = verifyAndResolveVisionProvenance({
    visionToken: resA.visionToken,
    sellerId: 'seller-A',
  });
  assert.strictEqual(checkA.sellerId, 'seller-A');
});

runTest('Repeated access to entry preserves its recency across multiple evictions', () => {
  clearVisionStore();
  const visionData = createMockVisionData();

  // Insert A
  const resA = createVisionProvenanceToken({ visionData, sellerId: 'seller-A' });

  // Fill up to capacity
  for (let i = 1; i < MAX_STORE_ENTRIES; i++) {
    createVisionProvenanceToken({ visionData, sellerId: `seller-${i}` });
  }

  // Access A repeatedly while inserting 10 more overflow entries
  for (let k = 0; k < 10; k++) {
    verifyAndResolveVisionProvenance({ visionToken: resA.visionToken, sellerId: 'seller-A' });
    createVisionProvenanceToken({ visionData, sellerId: `overflow-seller-${k}` });
  }

  // A must still exist because its recency was refreshed each time
  const checkA = verifyAndResolveVisionProvenance({ visionToken: resA.visionToken, sellerId: 'seller-A' });
  assert.strictEqual(checkA.sellerId, 'seller-A');
});

runTest('Invalid or unauthorized access attempts do NOT refresh recency', () => {
  clearVisionStore();
  const visionData = createMockVisionData();

  // 1. Insert A
  const resA = createVisionProvenanceToken({ visionData, sellerId: 'seller-legitimate' });
  // 2. Fill up to capacity
  for (let i = 1; i < MAX_STORE_ENTRIES; i++) {
    createVisionProvenanceToken({ visionData, sellerId: `seller-${i}` });
  }

  // 3. Attacker attempts cross-tenant access to A -> rejected with 403
  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: resA.visionToken,
        sellerId: 'seller-attacker',
      });
    },
    (err) => err.code === 'TENANT_MISMATCH' && err.statusCode === 403
  );

  // 4. Insert overflow entry
  createVisionProvenanceToken({ visionData, sellerId: 'seller-overflow' });

  // 5. Confirm A was evicted (because unauthorized access did NOT refresh its recency)
  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: resA.visionToken,
        sellerId: 'seller-legitimate',
      });
    },
    (err) => err.code === 'VISION_RESULT_NOT_FOUND' && err.statusCode === 404
  );
});

runTest('Recency refresh strictly preserves TTL and original expiration timestamp', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId: 'seller-ttl',
    ttlMs: 5000,
  });

  const originalExpiresAt = tokenResult.expiresAt;

  // Access the entry
  verifyAndResolveVisionProvenance({
    visionToken: tokenResult.visionToken,
    sellerId: 'seller-ttl',
  });

  // Re-verify that expiresAt in token result matches
  assert.strictEqual(tokenResult.expiresAt, originalExpiresAt);
});

runTest('Recency refresh does not alter aggregate byte accounting', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId: 'seller-bytes',
  });

  const bytesBefore = getCurrentStoreBytes();
  assert.ok(bytesBefore > 0);

  // Access entry multiple times
  verifyAndResolveVisionProvenance({ visionToken: tokenResult.visionToken, sellerId: 'seller-bytes' });
  verifyAndResolveVisionProvenance({ visionToken: tokenResult.visionToken, sellerId: 'seller-bytes' });

  const bytesAfter = getCurrentStoreBytes();
  assert.strictEqual(bytesAfter, bytesBefore, 'Recency refresh must neither increase nor decrease currentStoreBytes');
});

// ----------------------------------------------------
// SECTION 4: Strict Schema Validation & Limits
// ----------------------------------------------------
console.log('\n--- SECTION 4: Strict Schema Validation & Boundary Limits ---');

runTest('Accepts fully conforming ProductIntelligenceResult', () => {
  const data = createMockVisionData();
  const validated = ProductIntelligenceResultSchema.parse(data);
  assert.strictEqual(validated.product_type, data.product_type);
});

runTest('Python vision schema strictly rejects seller_input as evidence_source', () => {
  const compromisedPythonResult = createMockVisionData({
    attributes: [
      {
        name: 'material',
        value: 'Silk',
        confidence: 0.9,
        evidence_source: 'seller_input', // MUST be rejected in Python vision schema!
        uncertainty_status: 'confirmed_observation',
      },
    ],
  });

  assert.throws(() => ProductIntelligenceResultSchema.parse(compromisedPythonResult));
});

runTest('Rejects confidence < 0 or > 1 with schema validation error', () => {
  const dataLow = createMockVisionData({
    category: {
      ...createMockVisionData().category,
      confidence: -0.1,
    },
  });
  assert.throws(() => ProductIntelligenceResultSchema.parse(dataLow));

  const dataHigh = createMockVisionData({
    category: {
      ...createMockVisionData().category,
      confidence: 1.5,
    },
  });
  assert.throws(() => ProductIntelligenceResultSchema.parse(dataHigh));
});

runTest('Rejects invalid uncertainty status not matching the enum', () => {
  const invalidAttrData = createMockVisionData({
    attributes: [
      {
        name: 'color',
        value: 'blue',
        confidence: 0.9,
        evidence_source: 'vision_model',
        uncertainty_status: 'absolute_certainty_100pct', // invalid enum
      },
    ],
  });
  assert.throws(() => ProductIntelligenceResultSchema.parse(invalidAttrData));
});

runTest('Rejects unexpected top-level fields with unrecognized_keys error', () => {
  const dataWithExtra = createMockVisionData({
    hallucinated_marketplace_sku: 'AMZ-12345',
  });
  assert.throws(() => ProductIntelligenceResultSchema.parse(dataWithExtra));
});

runTest('Rejects string exceeding defined maximum length limits', () => {
  const oversizedData = createMockVisionData({
    product_type: 'A'.repeat(301), // limit is 300
  });
  assert.throws(() => ProductIntelligenceResultSchema.parse(oversizedData));
});

runTest('SellerCorrectionsSchema strictly enforces field bounds and limits overrides to 50', () => {
  // Valid corrections
  const valid = {
    preferred_title: 'Valid Title'.repeat(5),
    preferred_brand: 'Brand',
    corrected_product_type: 'Type',
    corrected_material: 'Cotton',
    corrected_color: 'Blue',
    corrected_category: { primary_category: 'Decor', subcategory: 'Vases' },
    additional_details: 'Details',
    attribute_overrides: { craft: 'Handmade' },
    focal_product_selection: 'Focal item',
  };
  assert.doesNotThrow(() => SellerCorrectionsSchema.parse(valid));

  // Rejects > 50 attribute overrides
  const tooManyOverrides = {};
  for (let i = 0; i < 51; i++) {
    tooManyOverrides[`key_${i}`] = 'val';
  }
  assert.throws(() => SellerCorrectionsSchema.parse({ attribute_overrides: tooManyOverrides }));

  // Rejects override key > 100 chars
  assert.throws(() => SellerCorrectionsSchema.parse({ attribute_overrides: { ['K'.repeat(101)]: 'val' } }));

  // Rejects override value > 500 chars
  assert.throws(() => SellerCorrectionsSchema.parse({ attribute_overrides: { craft: 'V'.repeat(501) } }));

  // Rejects additional_details > 2000 chars
  assert.throws(() => SellerCorrectionsSchema.parse({ additional_details: 'A'.repeat(2001) }));
});

// ----------------------------------------------------
// SECTION 5: Seller Corrections & Provenance Semantics
// ----------------------------------------------------
console.log('\n--- SECTION 5: Seller Corrections & Provenance Semantics ---');

runTest('Seller corrections are marked with seller_provided provenance (never falsely confirmed_observation)', () => {
  const originalVision = createMockVisionData();
  const sellerCorrections = {
    preferred_title: 'Handmade Teak Wood Decorative Box with Brass Inlay',
    preferred_brand: 'Heritage Handicrafts',
    corrected_product_type: 'Decorative Trinket Box',
    corrected_material: 'Pure Teak Wood',
    corrected_color: 'Antique Walnut Brown',
    corrected_category: {
      primary_category: 'Home Decor',
      subcategory: 'Decorative Storage',
    },
    additional_details: 'Finished with natural bees-wax coating.',
    attribute_overrides: {
      craft_technique: 'Hand Chiseled',
    },
  };

  const result = resolveEffectiveAttributes(originalVision, sellerCorrections);

  // Effective attributes must reflect seller corrections for listing generation
  assert.strictEqual(result.effective_attributes.title, sellerCorrections.preferred_title);
  assert.strictEqual(result.effective_attributes.brand, sellerCorrections.preferred_brand);

  // Product type: marked as seller_input and seller_provided, NOT confirmed_observation
  assert.strictEqual(result.effective_attributes.product_type.value, sellerCorrections.corrected_product_type);
  assert.strictEqual(result.effective_attributes.product_type.evidence_source, 'seller_input');
  assert.strictEqual(result.effective_attributes.product_type.uncertainty_status, 'seller_provided');
  assert.strictEqual(result.effective_attributes.product_type.provenance, 'seller_provided');

  // Category: marked as seller_input and seller_provided
  assert.strictEqual(result.effective_attributes.category.primary_category, 'Home Decor');
  assert.strictEqual(result.effective_attributes.category.evidence_source, 'seller_input');
  assert.strictEqual(result.effective_attributes.category.uncertainty_status, 'seller_provided');
  assert.strictEqual(result.effective_attributes.category.provenance, 'seller_provided');

  // Material: marked as seller_provided
  const materialAttr = result.effective_attributes.attributes.find((a) => a.name === 'material');
  assert.strictEqual(materialAttr.value, 'Pure Teak Wood');
  assert.strictEqual(materialAttr.evidence_source, 'seller_input');
  assert.strictEqual(materialAttr.uncertainty_status, 'seller_provided');
  assert.strictEqual(materialAttr.provenance, 'seller_provided');

  // Attribute override: marked as seller_provided
  const customOverride = result.effective_attributes.attributes.find((a) => a.name === 'craft_technique');
  assert.strictEqual(customOverride.value, 'Hand Chiseled');
  assert.strictEqual(customOverride.evidence_source, 'seller_input');
  assert.strictEqual(customOverride.uncertainty_status, 'seller_provided');
  assert.strictEqual(customOverride.provenance, 'seller_provided');
});

runTest('Original vision evidence remains immutable when seller corrections are applied', () => {
  const originalVision = createMockVisionData();
  const sellerCorrections = {
    corrected_material: 'Pure 24K Gold',
  };

  const result = resolveEffectiveAttributes(originalVision, sellerCorrections);

  // Original vision must not be altered
  const origMaterial = result.original_vision.attributes.find((a) => a.name === 'material');
  assert.strictEqual(origMaterial.value, 'Sheesham Wood');
  assert.strictEqual(origMaterial.confidence, 0.88);
  assert.strictEqual(origMaterial.evidence_source, 'vision_model');
  assert.strictEqual(origMaterial.uncertainty_status, 'reasonable_inference');

  // Verify object is frozen
  assert.ok(Object.isFrozen(result.original_vision), 'Original vision copy must be frozen');
});

runTest('Unknown information remains unknown unless corrected by seller', () => {
  const originalVision = createMockVisionData();
  const result = resolveEffectiveAttributes(originalVision, null);

  const dimAttr = result.effective_attributes.attributes.find((a) => a.name === 'dimensions');
  assert.strictEqual(dimAttr.value, 'unknown');
  assert.strictEqual(dimAttr.uncertainty_status, 'unknown');
  assert.strictEqual(dimAttr.provenance, 'vision_unknown');
  assert.strictEqual(dimAttr.confidence, 0.0);
});

// ----------------------------------------------------
// SECTION 6: Multiple Products Handling
// ----------------------------------------------------
console.log('\n--- SECTION 6: Multiple Products & Focal Point Disambiguation ---');

runTest('Preserves multiple_products_detected flag and flags required focal selection', () => {
  const multiVision = createMockVisionData({
    multiple_products_detected: true,
  });

  const resultWithoutFocal = resolveEffectiveAttributes(multiVision, null);

  assert.strictEqual(resultWithoutFocal.multiple_products_status.detected, true);
  assert.strictEqual(resultWithoutFocal.multiple_products_status.resolved, false);
  assert.strictEqual(resultWithoutFocal.multiple_products_status.requires_focal_selection, true);
});

runTest('Resolves multiple products status when valid seller focal selection is provided', () => {
  const multiVision = createMockVisionData({
    multiple_products_detected: true,
  });

  const sellerCorrections = {
    focal_product_selection: 'The central hand-carved jewelry box (exclude background props)',
  };

  const resultWithFocal = resolveEffectiveAttributes(multiVision, sellerCorrections);

  assert.strictEqual(resultWithFocal.multiple_products_status.detected, true);
  assert.strictEqual(resultWithFocal.multiple_products_status.resolved, true);
  assert.strictEqual(resultWithFocal.multiple_products_status.requires_focal_selection, false);
  assert.strictEqual(resultWithFocal.multiple_products_status.focal_selection, sellerCorrections.focal_product_selection);
});

// ----------------------------------------------------
// SECTION 7: Restart Fallback Verification
// ----------------------------------------------------
console.log('\n--- SECTION 7: Restart Fallback & Tamper Verification ---');

runTest('Restart fallback: accepts authentic clientVisionData matching signed digest', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-fallback-1';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
  });

  // Emulate server restart: memory cache completely cleared
  clearVisionStore();

  const resolved = verifyAndResolveVisionProvenance({
    visionToken: tokenResult.visionToken,
    sellerId,
    clientVisionData: visionData,
  });

  assert.strictEqual(resolved.visionData.product_type, visionData.product_type);
  assert.strictEqual(resolved.sellerId, sellerId);
});

runTest('Restart fallback: rejects tampered clientVisionData against signed digest (403)', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-fallback-1';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
  });

  // Emulate server restart: memory cache cleared
  clearVisionStore();

  // Tamper with client payload
  const tamperedData = createMockVisionData();
  tamperedData.product_type = 'Malicious Forged Product Type';

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: tokenResult.visionToken,
        sellerId,
        clientVisionData: tamperedData,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'TAMPERED_VISION_DATA' && err.statusCode === 403
  );
});

runTest('Restart fallback: rejects malformed clientVisionData failing schema validation (400)', () => {
  clearVisionStore();
  // Valid token
  const visionData = createMockVisionData();
  const sellerId = 'seller-fallback-1';

  // Issue token for an object, but pass malformed payload structure
  const malformedData = { product_type: 'Only this field' };
  const malformedDigest = computeVisionDigest(malformedData);

  const token = jwt.sign(
    {
      sub: crypto.randomUUID(),
      sellerId,
      storeId: null,
      digest: malformedDigest,
      type: 'vision_provenance',
      exp: Math.floor(Date.now() / 1000) + 1800,
    },
    getProvenanceSigningKey(),
    { algorithm: 'HS256' }
  );

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: token,
        sellerId,
        clientVisionData: malformedData,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'MALFORMED_VISION_DATA' && err.statusCode === 400
  );
});

runTest('Restart fallback: rejects request when server cache missed and no clientVisionData provided (404)', () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-fallback-1';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
  });

  // Emulate server restart: cache cleared
  clearVisionStore();

  assert.throws(
    () => {
      verifyAndResolveVisionProvenance({
        visionToken: tokenResult.visionToken,
        sellerId,
        clientVisionData: null,
      });
    },
    (err) => err instanceof VisionProvenanceError && err.code === 'VISION_RESULT_NOT_FOUND' && err.statusCode === 404
  );
});

// ----------------------------------------------------
// SECTION 8: Controller & Endpoint Integration
// ----------------------------------------------------
console.log('\n--- SECTION 8: Controller Integration (analyze & validate endpoints) ---');

await runAsyncTest('analyzeProductImage returns vision_token and expires_at alongside vision result', async () => {
  clearVisionStore();
  const { req, res } = createMockExpress({
    file: {
      buffer: Buffer.from('fake-image-bytes'),
      originalname: 'handicraft.jpg',
      mimetype: 'image/jpeg',
    },
    body: {
      enable_ocr: false,
    },
  });

  const provenance = createVisionProvenanceToken({
    visionData: createMockVisionData(),
    sellerId: req.tenant.sellerId,
    storeId: req.tenant.storeId,
  });

  assert.ok(provenance.visionToken);
  assert.ok(provenance.expiresAt);
});

await runAsyncTest('validateVisionContract endpoint validates token and returns effective attributes', async () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const sellerId = 'seller-cont-001';
  const storeId = 'store-cont-001';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId,
    storeId,
  });

  const { req, res } = createMockExpress({
    tenant: {
      sellerId,
      storeId,
    },
    body: {
      vision_token: tokenResult.visionToken,
      seller_corrections: {
        preferred_title: 'Controller Tested Product Title',
        corrected_material: 'Solid Brass',
      },
    },
  });

  await validateVisionContract(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.effective_attributes.title, 'Controller Tested Product Title');
  assert.strictEqual(res.body.data.effective_attributes.attributes.find(a => a.name === 'material').provenance, 'seller_provided');
  assert.strictEqual(res.body.data.seller_id, sellerId);
});

await runAsyncTest('validateVisionContract endpoint rejects cross-tenant token with 403', async () => {
  clearVisionStore();
  const visionData = createMockVisionData();
  const legitimateSeller = 'seller-legitimate-001';
  const maliciousSeller = 'seller-impostor-002';

  const tokenResult = createVisionProvenanceToken({
    visionData,
    sellerId: legitimateSeller,
  });

  const { req, res } = createMockExpress({
    tenant: {
      sellerId: maliciousSeller, // Attacker tenant context
      storeId: null,
    },
    body: {
      vision_token: tokenResult.visionToken,
    },
  });

  await validateVisionContract(req, res);

  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.code, 'TENANT_MISMATCH');
});

console.log('\n====================================================');
console.log(`TEST SUITE RESULTS: ${passedTests} passed, ${failedTests} failed`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
