/**
 * Automated Test Suite: LLM Listing Generation Orchestration (Phase 03.3.3)
 *
 * Verifies:
 * 1. Input Validation and Provenance Verification (Tokens, Multi-Tenant, Digest, Multi-Product Guard)
 * 2. Provider Invocation & Failover (OpenAI, Gemini, Timeouts, HTTP 500, Deadline Enforcement)
 * 3. Deterministic Provenance Reconciliation (Anti-Hallucination, Name/Value Mismatches, Inferences)
 * 4. Grounded Fallback Engine (Strict Non-Fabrication of Unverified Claims)
 * 5. AIJob Audit Lifecycle Tracking & Tenant Isolation
 * 6. Controller Integration & Error Mapping
 */

import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  createVisionProvenanceToken,
  clearVisionStore,
  getProvenanceSigningKey,
  DEFAULT_PROVENANCE_TTL_MS,
} from '../src/modules/ai/visionProvenance.service.js';
import {
  orchestrateListingGeneration,
  reconcileProvenance,
  buildGroundedFallbackListing,
  ListingOrchestrationError,
} from '../src/modules/ai/listingGeneration.service.js';
import { generateListingDraft } from '../src/modules/ai/listing.controller.js';
import { AIJob } from '../src/modules/ai/ai.model.js';

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

console.log('====================================================');
console.log('LLM LISTING GENERATION ORCHESTRATION TEST SUITE');
console.log('Phase 03.3.3: LLM Providers & Provenance Reconciliation');
console.log('====================================================\n');

// Deterministic mock vision data conforming to ProductIntelligenceResultSchema
const createMockVisionData = (overrides = {}) => ({
  product_type: 'Handcrafted Wooden Jewelry Box',
  visual_description: 'An intricately carved wooden jewelry box with brass latch and floral engraving on lid.',
  multiple_products_detected: false,
  category: {
    primary_category: 'Home & Living',
    subcategory: 'Jewelry Storage',
    alternative_categories: ['Handicrafts'],
    confidence: 0.94,
    uncertainty_status: 'confirmed_observation',
    reasoning: 'Geometric jewelry compartment layout with decorative lid.',
  },
  attributes: [
    {
      name: 'primary_color',
      value: 'Brown',
      confidence: 0.92,
      evidence_source: 'vision_model',
      uncertainty_status: 'confirmed_observation',
      notes: 'Natural walnut hue',
    },
    {
      name: 'pattern',
      value: 'Floral Carving',
      confidence: 0.88,
      evidence_source: 'vision_model',
      uncertainty_status: 'reasonable_inference',
      notes: 'Carved lid ornamentation',
    },
    {
      name: 'material',
      value: 'Wood',
      confidence: 0.80,
      evidence_source: 'vision_model',
      uncertainty_status: 'reasonable_inference',
      notes: 'Visual grain appearance',
    },
  ],
  ocr: {
    status: 'success',
    extracted_text: 'ROYAL ARTISANS JAIPUR',
    segments: [{ text: 'ROYAL ARTISANS JAIPUR', confidence: 0.95 }],
    segment_count: 1,
    engine: 'PaddleOCR',
    execution_time_ms: 120,
  },
  uncertainties: ['Exact wood species cannot be confirmed visually'],
  image_metadata: {
    width: 800,
    height: 800,
    format: 'jpeg',
    size_bytes: 45000,
    aspect_ratio: 1.0,
    has_exif: false,
    channels: 3,
  },
  processing_metadata: { model: 'gemini-1.5-flash' },
  ...overrides,
});

// Mock valid JSON output string from LLM
const createMockLlmResponseJson = (overrides = {}) => ({
  title: 'Artisan Carved Sheesham Wooden Jewelry Box with Brass Latch',
  short_description: 'Handmade rectangular jewelry storage organizer box featuring detailed floral carving and antique brass clasp hardware.',
  description: 'Add timeless beauty to your vanity with this artisan-crafted wooden jewelry box. Featuring floral carved motifs and traditional brass hardware, it provides dedicated compartments for necklaces, rings, and earrings while protecting your valuables.',
  product_type: 'Wooden Jewelry Box',
  category: {
    primary_category: 'Home & Living',
    subcategory: 'Jewelry Storage',
  },
  brand: 'Royal Artisans',
  attributes: [
    {
      name: 'primary_color',
      value: 'Brown',
      evidence_source: 'vision_model',
      uncertainty_status: 'confirmed_observation',
      provenance: 'vision_observation',
      notes: 'Natural walnut hue',
    },
    {
      name: 'pattern',
      value: 'Floral Carving',
      evidence_source: 'vision_model',
      uncertainty_status: 'reasonable_inference',
      provenance: 'vision_inference',
      notes: 'Carved lid ornamentation',
    },
    {
      name: 'material',
      value: 'Wood',
      evidence_source: 'vision_model',
      uncertainty_status: 'reasonable_inference',
      provenance: 'vision_inference',
      notes: 'Visual grain appearance',
    },
  ],
  bullet_points: [
    'Hand-finished wooden construction with natural grain finish',
    'Intricate floral relief carving on the hinged lid',
    'Fitted with an antique-style brass clasp and dual rear hinges',
    'Compact dimensions suitable for nightstands and dressing tables',
  ],
  search_keywords: [
    'wooden jewelry box',
    'handcrafted storage box',
    'carved keepsake organizer',
    'brass latch box',
  ],
  seo: {
    meta_title: 'Carved Wooden Jewelry Box with Brass Latch | Royal Artisans',
    meta_description: 'Discover handcrafted wooden jewelry storage boxes featuring antique brass hardware and floral carvings. Shop online for authentic artisan storage.',
    slug: 'carved-wooden-jewelry-box-brass-latch',
  },
  fields_requiring_seller_confirmation: ['exact_dimensions'],
  validation_warnings: [],
  ...overrides,
});

const createMockValidListingOutput = createMockLlmResponseJson;

// Setup mock AIJob memory store for audit tests
const capturedAiJobs = [];
const originalCreate = AIJob.create;
const originalFindByIdAndUpdate = AIJob.findByIdAndUpdate;

AIJob.create = async (doc) => {
  const record = { _id: crypto.randomUUID(), ...doc, createdAt: new Date() };
  capturedAiJobs.push(record);
  return record;
};

AIJob.findByIdAndUpdate = async (id, update) => {
  const item = capturedAiJobs.find((j) => j._id === id);
  if (item) {
    Object.assign(item, update);
    return item;
  }
  return null;
};

const tenantA = { sellerId: 'seller_100', storeId: 'store_200' };
const tenantB = { sellerId: 'seller_999', storeId: 'store_888' };

async function runTestSuite() {
  clearVisionStore();

  // ========================================================
  // SECTION 1: Input Validation and Provenance Verification
  // ========================================================
  console.log('--- SECTION 1: Input Validation and Provenance Verification ---');

  await runTest('1. Valid input with authentic token generates successful listing', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: JSON.stringify(createMockLlmResponseJson()),
        }),
      }
    );

    assert(res.listing && res.listing.title);
    assert.strictEqual(res.metadata.ai_provider, 'openai');
    assert.strictEqual(res.metadata.is_fallback, false);
    assert.strictEqual(res.metadata.vision_grounded, true);
  });

  await runTest('2. Rejects request missing vision_token with validation error (400)', async () => {
    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, {});
      },
      (err) => err.name === 'ZodError'
    );
  });

  await runTest('3. Rejects invalid/tampered vision_token signature with INVALID_VISION_TOKEN (401)', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });
    const tamperedToken = tokenInfo.visionToken.slice(0, -6) + 'abcdef';

    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, { vision_token: tamperedToken });
      },
      (err) => err.code === 'INVALID_VISION_TOKEN' && err.statusCode === 401
    );
  });

  await runTest('4. Rejects expired vision_token with VISION_TOKEN_EXPIRED (401)', async () => {
    const signingKey = getProvenanceSigningKey();
    const expiredPayload = {
      sub: crypto.randomUUID(),
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      digest: 'some_digest',
      type: 'vision_provenance',
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 1800, // Expired 30m ago
    };
    const expiredToken = jwt.sign(expiredPayload, signingKey, { algorithm: 'HS256' });

    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, { vision_token: expiredToken });
      },
      (err) => err.code === 'VISION_TOKEN_EXPIRED' && err.statusCode === 401
    );
  });

  await runTest('5. Rejects cross-seller access attempt with TENANT_MISMATCH (403)', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantB.sellerId,
      storeId: tenantB.storeId,
    });

    // Tenant A attempts to use Tenant B's token
    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, { vision_token: tokenInfo.visionToken });
      },
      (err) => err.code === 'TENANT_MISMATCH' && err.statusCode === 403
    );
  });

  await runTest('6. Rejects cross-store access attempt with STORE_MISMATCH (403)', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: 'store_other_999',
    });

    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, { vision_token: tokenInfo.visionToken });
      },
      (err) => err.code === 'STORE_MISMATCH' && err.statusCode === 403
    );
  });

  await runTest('7. Restart fallback: rejects tampered clientVisionData failing digest check (403)', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    clearVisionStore(); // Simulate server restart (cache cleared)

    const tamperedData = createMockVisionData({ product_type: 'Forged Gold Bar' });

    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, {
          vision_token: tokenInfo.visionToken,
          client_vision_data: tamperedData,
        });
      },
      (err) => err.code === 'TAMPERED_VISION_DATA' && err.statusCode === 403
    );
  });

  await runTest('8. Rejects multiple products without focal selection with FOCAL_PRODUCT_SELECTION_REQUIRED (400)', async () => {
    const multiVision = createMockVisionData({ multiple_products_detected: true });
    const tokenInfo = createVisionProvenanceToken({
      visionData: multiVision,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    await assert.rejects(
      async () => {
        await orchestrateListingGeneration(tenantA, { vision_token: tokenInfo.visionToken });
      },
      (err) => err.code === 'FOCAL_PRODUCT_SELECTION_REQUIRED' && err.statusCode === 400
    );
  });

  await runTest('9. Correctly accepts seller-provided focal selection and corrections', async () => {
    const multiVision = createMockVisionData({ multiple_products_detected: true });
    const tokenInfo = createVisionProvenanceToken({
      visionData: multiVision,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const res = await orchestrateListingGeneration(
      tenantA,
      {
        vision_token: tokenInfo.visionToken,
        seller_corrections: {
          focal_product_selection: 'The central wooden box with floral carving',
          preferred_title: 'Seller Preferred Handcrafted Box',
          corrected_material: 'Rosewood',
        },
      },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: JSON.stringify(createMockLlmResponseJson({ title: 'Seller Preferred Handcrafted Box' })),
        }),
      }
    );

    assert(res.listing);
    assert.strictEqual(res.listing.title, 'Seller Preferred Handcrafted Box');
  });

  // ========================================================
  // SECTION 2: Provider Behavior & Failover
  // ========================================================
  console.log('\n--- SECTION 2: Provider Behavior & Failover ---');

  await runTest('10. Successful Gemini provider generation', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'gemini',
          rawText: JSON.stringify(createMockLlmResponseJson()),
        }),
      }
    );

    assert.strictEqual(res.metadata.ai_provider, 'gemini');
    assert.strictEqual(res.metadata.is_fallback, false);
  });

  await runTest('11. Successful OpenAI provider generation', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: JSON.stringify(createMockLlmResponseJson()),
        }),
      }
    );

    assert.strictEqual(res.metadata.ai_provider, 'openai');
    assert.strictEqual(res.metadata.is_fallback, false);
  });

  await runTest('12. Primary provider HTTP 500 triggers secondary failover', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    let calls = 0;
    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => {
          calls++;
          if (calls === 1) {
            throw new Error('Primary OpenAI API 500 Internal Error');
          }
          return {
            provider: 'gemini',
            rawText: JSON.stringify(createMockLlmResponseJson()),
          };
        },
      }
    );

    // If primary failed in mock, it falls back to fallback
    assert(res.listing);
  });

  await runTest('13. Provider timeout triggers failover or safe grounded fallback', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => {
          throw new ListingOrchestrationError('Provider request timed out after 30000ms', 'PROVIDER_TIMEOUT', 504);
        },
      }
    );

    assert(res.listing);
    assert.strictEqual(res.metadata.is_fallback, true);
    assert.strictEqual(res.metadata.ai_provider, 'fallback');
  });

  await runTest('14. Secondary provider success after primary failure', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    let attempt = 0;
    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => {
          attempt++;
          if (attempt === 1) throw new Error('Primary unavailable');
          return { provider: 'secondary', rawText: JSON.stringify(createMockLlmResponseJson()) };
        },
      }
    );

    assert(res.listing);
  });

  await runTest('15. Both providers failing engages safe grounded fallback without fabrication', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => {
          throw new Error('Both upstream providers down');
        },
      }
    );

    assert(res.listing);
    assert.strictEqual(res.metadata.is_fallback, true);
    assert.strictEqual(res.metadata.ai_provider, 'fallback');

    // Confirm zero generic claims in fallback
    const text = JSON.stringify(res.listing);
    assert(!text.includes('Cotton Blend'));
    assert(!text.includes('Made in India'));
  });

  await runTest('16. Missing API keys engages safe grounded fallback directly', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    // With no mockProviderFn and no API keys configured in test environment
    const res = await orchestrateListingGeneration(tenantA, { vision_token: tokenInfo.visionToken });
    assert(res.listing);
    assert.strictEqual(res.metadata.is_fallback, true);
  });

  await runTest('17. Malformed JSON cleans markdown fences and parses valid JSON', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const fencedJson = '```json\n' + JSON.stringify(createMockLlmResponseJson()) + '\n```';
    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: fencedJson,
        }),
      }
    );

    assert(res.listing);
    assert.strictEqual(res.metadata.is_fallback, false);
  });

  await runTest('18. Schema-invalid output falls back safely rather than serving bad data', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const invalidJson = JSON.stringify({ invalid_root: 'missing all required fields' });
    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: invalidJson,
        }),
      }
    );

    // Schema validation failure triggers fallback
    assert(res.listing);
    assert.strictEqual(res.metadata.is_fallback, true);
  });

  await runTest('19. Provider repair attempt is strictly bounded (at most 2 calls total)', async () => {
    let callCount = 0;
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => {
          callCount++;
          throw new Error('Failure');
        },
      }
    );

    assert(callCount <= 2);
  });

  await runTest('20. Overall generation deadline is strictly checked before execution', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    // Provide 100ms deadline which expires before provider
    const res = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        deadlineMs: 1, // Immediately expired deadline
      }
    );

    // Falls back safely without hanging
    assert(res.listing);
    assert.strictEqual(res.metadata.is_fallback, true);
  });

  // ========================================================
  // SECTION 3: Deterministic Provenance Reconciliation
  // ========================================================
  console.log('\n--- SECTION 3: Deterministic Provenance Reconciliation ---');

  await runTest('21. LLM attempts to assign false provenance -> Server authoritatively restores verified data', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'primary_color',
          value: 'Brown',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'primary_color',
          value: 'Brown',
          evidence_source: 'seller_input', // LLM falsely claimed seller_input
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'primary_color');
    assert.strictEqual(attr.evidence_source, 'vision_model');
    assert.strictEqual(attr.uncertainty_status, 'confirmed_observation');
    assert.strictEqual(attr.provenance, 'vision_observation');
  });

  await runTest('22. MANDATORY: Same attribute name but different value (Wood vs Brass) is demoted to inference', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'material',
          value: 'Wood',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    // LLM altered material from Wood to Brass!
    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'material',
          value: 'Brass',
          evidence_source: 'vision_model', // LLM attempts to keep verified status
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'material');

    // MUST NOT restore vision_model or confirmed_observation!
    assert.strictEqual(attr.evidence_source, 'inferred');
    assert.strictEqual(attr.uncertainty_status, 'reasonable_inference');
    assert.strictEqual(attr.provenance, 'vision_inference');

    // Must be flagged for seller confirmation
    assert(reconciled.fields_requiring_seller_confirmation.includes('material'));
    assert(reconciled.validation_warnings.some((w) => w.includes('differs from verified evidence')));
  });

  await runTest('23. Exact trusted attribute match retains authentic casing and values', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'Primary_Color',
          value: 'Brown',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [{ name: 'primary_color', value: 'Brown', evidence_source: 'vision_model', uncertainty_status: 'confirmed_observation', provenance: 'vision_observation' }],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name.toLowerCase() === 'primary_color');
    assert.strictEqual(attr.name, 'Primary_Color');
  });

  await runTest('24. Seller-provided attribute strictly preserves seller_provided provenance', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'wood_type',
          value: 'Sheesham',
          evidence_source: 'seller_input',
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [{ name: 'wood_type', value: 'Sheesham', evidence_source: 'inferred', uncertainty_status: 'reasonable_inference', provenance: 'vision_inference' }],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'wood_type');
    assert.strictEqual(attr.evidence_source, 'seller_input');
    assert.strictEqual(attr.uncertainty_status, 'seller_provided');
    assert.strictEqual(attr.provenance, 'seller_provided');
  });

  await runTest('25. Invented attribute by LLM is demoted to inference and requires seller confirmation', () => {
    const effectiveAttributes = { attributes: [] }; // No attributes in evidence
    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'water_resistance',
          value: 'IPX4',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'water_resistance');
    assert.strictEqual(attr.evidence_source, 'inferred');
    assert.strictEqual(attr.uncertainty_status, 'reasonable_inference');
    assert.strictEqual(attr.provenance, 'vision_inference');
    assert(reconciled.fields_requiring_seller_confirmation.includes('water_resistance'));
  });

  await runTest('26. Preserves omitted verified physical attributes in final output', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'primary_color',
          value: 'Brown',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
        {
          name: 'dimensions',
          value: '20x15 cm',
          evidence_source: 'seller_input',
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
        },
      ],
    };

    // LLM omitted primary_color and dimensions completely
    const candidate = createMockValidListingOutput({
      attributes: [],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    assert.strictEqual(reconciled.attributes.length, 2);
    assert(reconciled.attributes.some((a) => a.name === 'primary_color'));
    assert(reconciled.attributes.some((a) => a.name === 'dimensions'));
  });

  await runTest('27. Deduplicates attributes deterministically without conflicting duplicates', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'color',
          value: 'Brown',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [
        { name: 'color', value: 'Brown', evidence_source: 'vision_model', uncertainty_status: 'confirmed_observation', provenance: 'vision_observation' },
        { name: 'COLOR', value: 'Dark Brown', evidence_source: 'vision_model', uncertainty_status: 'confirmed_observation', provenance: 'vision_observation' },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const colorAttrs = reconciled.attributes.filter((a) => a.name.toLowerCase() === 'color');
    assert.strictEqual(colorAttrs.length, 1);
  });

  await runTest('28. No invented physical claims are permitted in fallback', () => {
    const effective = {
      product_type: { value: 'Ceramic Plate' },
      visual_description: 'A blue circular ceramic decorative plate with geometric pattern.',
      category: { primary_category: 'Home & Kitchen', subcategory: 'Serveware' },
      attributes: [],
    };

    const fallback = buildGroundedFallbackListing(effective);
    const text = JSON.stringify(fallback);
    assert(!text.includes('Cotton Blend'));
    assert(!text.includes('Made in India'));
    assert(!text.includes('Solid Brass'));
  });

  // ========================================================
  // SECTION 4: Fallback and AIJob Lifecycle
  // ========================================================
  console.log('\n--- SECTION 4: Fallback and AIJob Lifecycle ---');

  await runTest('29. Valid grounded fallback output conforms strictly to MarketplaceNeutralListingSchema', () => {
    const effective = {
      product_type: { value: 'Brass Bell' },
      visual_description: 'An engraved golden brass hanging bell with chain.',
      category: { primary_category: 'Handicrafts', subcategory: 'Bells & Chimes' },
      attributes: [
        { name: 'primary_color', value: 'Golden', evidence_source: 'vision_model', uncertainty_status: 'confirmed_observation', provenance: 'vision_observation' },
      ],
    };

    const fallback = buildGroundedFallbackListing(effective);
    assert(fallback.title.length >= 20 && fallback.title.length <= 150);
    assert(fallback.short_description.length >= 50 && fallback.short_description.length <= 300);
    assert(fallback.description.length >= 100 && fallback.description.length <= 3000);
    assert(fallback.bullet_points.length >= 3 && fallback.bullet_points.length <= 6);
    assert(fallback.search_keywords.length >= 3 && fallback.search_keywords.length <= 25);
  });

  await runTest('30. Insufficient evidence throws controlled INSUFFICIENT_EVIDENCE (422)', () => {
    assert.throws(
      () => buildGroundedFallbackListing({}),
      (err) => err.code === 'INSUFFICIENT_EVIDENCE' && err.statusCode === 422
    );
  });

  await runTest('31. AIJob records successful generation with status: completed', async () => {
    capturedAiJobs.length = 0; // Clear audit captures
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: JSON.stringify(createMockLlmResponseJson()),
        }),
      }
    );

    assert(capturedAiJobs.length >= 1);
    const lastJob = capturedAiJobs[capturedAiJobs.length - 1];
    assert.strictEqual(lastJob.status, 'completed');
    assert.strictEqual(lastJob.sellerId, tenantA.sellerId);
    assert.strictEqual(lastJob.storeId, tenantA.storeId);
  });

  await runTest('32. AIJob records failed generation when unrecoverable failure occurs', async () => {
    capturedAiJobs.length = 0;
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
      visionData,
    });

    try {
      await orchestrateListingGeneration(
        tenantA,
        { vision_token: tokenInfo.visionToken },
        {
          mockProviderFn: async () => {
            throw new Error('Total catastrophe');
          },
          disableFallback: true,
        }
      );
    } catch {
      // Expected failure
    }

    assert(capturedAiJobs.length >= 1);
    const lastJob = capturedAiJobs[capturedAiJobs.length - 1];
    assert.strictEqual(lastJob.status, 'failed');
    assert.strictEqual(lastJob.sellerId, tenantA.sellerId);
  });

  await runTest('33. AIJob uses authenticated sellerId and storeId strictly', async () => {
    capturedAiJobs.length = 0;
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantB.sellerId,
      storeId: tenantB.storeId,
    });

    await orchestrateListingGeneration(
      tenantB,
      { vision_token: tokenInfo.visionToken },
      {
        mockProviderFn: async () => ({
          provider: 'openai',
          rawText: JSON.stringify(createMockLlmResponseJson()),
        }),
      }
    );

    const lastJob = capturedAiJobs[capturedAiJobs.length - 1];
    assert.strictEqual(lastJob.sellerId, tenantB.sellerId);
    assert.strictEqual(lastJob.storeId, tenantB.storeId);
  });

  await runTest('34. AIJob failure does not leak internal secrets or tokens', async () => {
    capturedAiJobs.length = 0;
    const fakeSecret = 'sk-proj-super-secret-key-1234567890';
    const sanitized = ListingOrchestrationError.sanitize(`Error with key: ${fakeSecret}`);
    assert(!sanitized.includes(fakeSecret));
  });

  // ========================================================
  // SECTION 5: Controller Integration
  // ========================================================
  console.log('\n--- SECTION 5: Controller Integration ---');

  await runTest('35. Controller returns HTTP 200 with draft and server metadata', async () => {
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    const req = {
      tenant: tenantA,
      body: { vision_token: tokenInfo.visionToken },
    };

    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };

    await generateListingDraft(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert(res.payload.success);
    assert(res.payload.data.draft);
    assert(res.payload.data.metadata);
    assert.strictEqual(res.payload.data.metadata.vision_grounded, true);
  });

  await runTest('36. Controller rejects missing tenant with 401 UNAUTHORIZED_TENANT', async () => {
    const req = { tenant: null, body: { vision_token: 'some_token' } };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };

    await generateListingDraft(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.payload.code, 'UNAUTHORIZED_TENANT');
  });

  // ========================================================
  // SECTION 6: Provenance Hardening & Substring Rejection
  // ========================================================
  console.log('\n--- SECTION 6: Provenance Hardening & Substring Rejection ---');

  await runTest('37. Wood vs Wooden: Unmatched value is demoted to inference and not given verified provenance', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'material',
          value: 'Wood',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'material',
          value: 'Wooden',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'material');

    assert.strictEqual(attr.evidence_source, 'inferred');
    assert.strictEqual(attr.uncertainty_status, 'reasonable_inference');
    assert.strictEqual(attr.provenance, 'vision_inference');
    assert.strictEqual(attr.value, 'Wooden');
    assert(reconciled.fields_requiring_seller_confirmation.includes('material'));
    assert(reconciled.validation_warnings.some((w) => w.includes('differs from verified evidence')));
  });

  await runTest('38. Brass vs Antique Brass: Substring value does NOT inherit trusted vision provenance', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'hardware_material',
          value: 'Brass',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'hardware_material',
          value: 'Antique Brass',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'hardware_material');

    assert.strictEqual(attr.evidence_source, 'inferred');
    assert.strictEqual(attr.uncertainty_status, 'reasonable_inference');
    assert.strictEqual(attr.provenance, 'vision_inference');
    assert(reconciled.fields_requiring_seller_confirmation.includes('hardware_material'));
  });

  await runTest('39. Cotton vs Cotton Blend: Fabricated blend does NOT inherit trusted cotton provenance', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'fabric',
          value: 'Cotton',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'fabric',
          value: 'Cotton Blend',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'fabric');

    assert.strictEqual(attr.evidence_source, 'inferred');
    assert.strictEqual(attr.uncertainty_status, 'reasonable_inference');
    assert.strictEqual(attr.provenance, 'vision_inference');
    assert(reconciled.fields_requiring_seller_confirmation.includes('fabric'));
  });

  await runTest('40. Case and whitespace normalization matches and restores authentic casing', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'Primary_Color',
          value: 'Royal Blue',
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          provenance: 'vision_observation',
        },
      ],
    };

    // Candidate has mixed case and extra internal whitespace
    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'primary_color',
          value: '  royal   blue  ',
          evidence_source: 'inferred',
          uncertainty_status: 'reasonable_inference',
          provenance: 'vision_inference',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'Primary_Color');

    assert(attr, 'Attribute should match on normalized name');
    assert.strictEqual(attr.name, 'Primary_Color', 'Preserves authentic name casing');
    assert.strictEqual(attr.value, 'Royal Blue', 'Restores authentic trusted value casing');
    assert.strictEqual(attr.evidence_source, 'vision_model');
    assert.strictEqual(attr.uncertainty_status, 'confirmed_observation');
    assert.strictEqual(attr.provenance, 'vision_observation');
  });

  await runTest('41. Exact seller-provided attribute matching strictly preserves seller_provided provenance', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'wood_type',
          value: 'Sheesham',
          evidence_source: 'seller_input',
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
        },
      ],
    };

    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'wood_type',
          value: 'sheesham',
          evidence_source: 'inferred',
          uncertainty_status: 'reasonable_inference',
          provenance: 'vision_inference',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'wood_type');

    assert.strictEqual(attr.value, 'Sheesham');
    assert.strictEqual(attr.evidence_source, 'seller_input');
    assert.strictEqual(attr.uncertainty_status, 'seller_provided');
    assert.strictEqual(attr.provenance, 'seller_provided');
  });

  await runTest('42. Same-name altered seller-provided value never inherits seller_provided provenance', () => {
    const effectiveAttributes = {
      attributes: [
        {
          name: 'wood_type',
          value: 'Sheesham',
          evidence_source: 'seller_input',
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
        },
      ],
    };

    // LLM substituted Sheesham with Teak Wood
    const candidate = createMockValidListingOutput({
      attributes: [
        {
          name: 'wood_type',
          value: 'Teak Wood',
          evidence_source: 'seller_input', // LLM attempts to keep seller_provided tag
          uncertainty_status: 'seller_provided',
          provenance: 'seller_provided',
        },
      ],
    });

    const reconciled = reconcileProvenance(candidate, effectiveAttributes);
    const attr = reconciled.attributes.find((a) => a.name === 'wood_type');

    assert.strictEqual(attr.evidence_source, 'inferred');
    assert.strictEqual(attr.uncertainty_status, 'reasonable_inference');
    assert.strictEqual(attr.provenance, 'vision_inference');
    assert.strictEqual(attr.value, 'Teak Wood');
    assert(reconciled.fields_requiring_seller_confirmation.includes('wood_type'));
    assert(reconciled.validation_warnings.some((w) => w.includes('differs from verified evidence')));
  });

  // ========================================================
  // SECTION 7: Provider Preference & Deadline Hardening
  // ========================================================
  console.log('\n--- SECTION 7: Provider Preference & Deadline Hardening ---');

  await runTest('43. Provider preference AI_PROVIDER=gemini calls Gemini first when both keys are configured', async () => {
    const origProvider = process.env.AI_PROVIDER;
    const origOpenAiKey = process.env.OPENAI_API_KEY;
    const origGeminiKey = process.env.GEMINI_API_KEY;

    process.env.AI_PROVIDER = 'gemini';
    process.env.OPENAI_API_KEY = 'sk-mock-openai-key-12345678';
    process.env.GEMINI_API_KEY = 'mock-gemini-key-12345678';

    const recordedOrder = [];
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({ visionData, sellerId: tenantA.sellerId, storeId: tenantA.storeId });

    try {
      const res = await orchestrateListingGeneration(
        tenantA,
        { vision_token: tokenInfo.visionToken },
        {
          mockProviderCall: async (provider) => {
            recordedOrder.push(provider);
            return JSON.stringify(createMockLlmResponseJson());
          },
        }
      );

      assert.strictEqual(recordedOrder.length, 1);
      assert.strictEqual(recordedOrder[0], 'gemini');
      assert.strictEqual(res.metadata.ai_provider, 'gemini');
    } finally {
      process.env.AI_PROVIDER = origProvider;
      process.env.OPENAI_API_KEY = origOpenAiKey;
      process.env.GEMINI_API_KEY = origGeminiKey;
    }
  });

  await runTest('44. Provider preference AI_PROVIDER=openai calls OpenAI first when both keys are configured', async () => {
    const origProvider = process.env.AI_PROVIDER;
    const origOpenAiKey = process.env.OPENAI_API_KEY;
    const origGeminiKey = process.env.GEMINI_API_KEY;

    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-mock-openai-key-12345678';
    process.env.GEMINI_API_KEY = 'mock-gemini-key-12345678';

    const recordedOrder = [];
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({ visionData, sellerId: tenantA.sellerId, storeId: tenantA.storeId });

    try {
      const res = await orchestrateListingGeneration(
        tenantA,
        { vision_token: tokenInfo.visionToken },
        {
          mockProviderCall: async (provider) => {
            recordedOrder.push(provider);
            return JSON.stringify(createMockLlmResponseJson());
          },
        }
      );

      assert.strictEqual(recordedOrder.length, 1);
      assert.strictEqual(recordedOrder[0], 'openai');
      assert.strictEqual(res.metadata.ai_provider, 'openai');
    } finally {
      process.env.AI_PROVIDER = origProvider;
      process.env.OPENAI_API_KEY = origOpenAiKey;
      process.env.GEMINI_API_KEY = origGeminiKey;
    }
  });

  await runTest('45. Overall deadline: Secondary provider receives only remaining deadline when primary consumes significant time and fails', async () => {
    const origProvider = process.env.AI_PROVIDER;
    const origOpenAiKey = process.env.OPENAI_API_KEY;
    const origGeminiKey = process.env.GEMINI_API_KEY;

    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-mock-openai-key-12345678';
    process.env.GEMINI_API_KEY = 'mock-gemini-key-12345678';

    const providerCalls = [];
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({ visionData, sellerId: tenantA.sellerId, storeId: tenantA.storeId });

    try {
      // Set an overall deadline of 6000ms
      const overallDeadlineMs = 6000;
      const res = await orchestrateListingGeneration(
        tenantA,
        { vision_token: tokenInfo.visionToken },
        {
          deadlineMs: overallDeadlineMs,
          mockProviderCall: async (provider, { providerTimeout, remainingDeadline }) => {
            providerCalls.push({ provider, providerTimeout, remainingDeadline });
            if (providerCalls.length === 1) {
              // First provider simulates consuming 2000ms then fails
              await new Promise((resolve) => setTimeout(resolve, 2000));
              throw new Error('Primary OpenAI 500 Failure');
            }
            // Secondary provider succeeds
            return JSON.stringify(createMockLlmResponseJson());
          },
        }
      );

      // Verify bounds
      assert.strictEqual(providerCalls.length, 2, 'Total provider calls must be bounded to 2');
      assert.strictEqual(providerCalls[0].provider, 'openai');
      assert.strictEqual(providerCalls[1].provider, 'gemini');

      // First call got almost the full deadline minus safety margin
      assert(providerCalls[0].remainingDeadline > 5500, `First call remainingDeadline was ${providerCalls[0].remainingDeadline}`);
      assert(providerCalls[0].providerTimeout <= 5500);

      // Second call remaining deadline must be significantly reduced (by at least ~2000ms)
      assert(
        providerCalls[1].remainingDeadline <= providerCalls[0].remainingDeadline - 1800,
        `Second call remaining deadline (${providerCalls[1].remainingDeadline}) was not reduced appropriately from first call (${providerCalls[0].remainingDeadline})`
      );
      assert(
        providerCalls[1].providerTimeout <= providerCalls[1].remainingDeadline - 500,
        'Second call timeout must not exceed remainingDeadline - 500'
      );

      // Successfully returned secondary provider output
      assert.strictEqual(res.metadata.ai_provider, 'gemini');
      assert.strictEqual(res.metadata.is_fallback, false);
    } finally {
      process.env.AI_PROVIDER = origProvider;
      process.env.OPENAI_API_KEY = origOpenAiKey;
      process.env.GEMINI_API_KEY = origGeminiKey;
    }
  });

  await runTest('46. Provider calls remain bounded (at most 2 calls) and cannot reset deadline when both fail', async () => {
    const origProvider = process.env.AI_PROVIDER;
    const origOpenAiKey = process.env.OPENAI_API_KEY;
    const origGeminiKey = process.env.GEMINI_API_KEY;

    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-mock-openai-key-12345678';
    process.env.GEMINI_API_KEY = 'mock-gemini-key-12345678';

    const providerCalls = [];
    const visionData = createMockVisionData();
    const tokenInfo = createVisionProvenanceToken({ visionData, sellerId: tenantA.sellerId, storeId: tenantA.storeId });

    try {
      const res = await orchestrateListingGeneration(
        tenantA,
        { vision_token: tokenInfo.visionToken },
        {
          deadlineMs: 5000,
          mockProviderCall: async (provider, info) => {
            providerCalls.push({ provider, ...info });
            throw new Error(`${provider} failed`);
          },
        }
      );

      assert.strictEqual(providerCalls.length, 2, 'Must not make more than 2 provider calls');
      assert.strictEqual(res.metadata.is_fallback, true);
      assert.strictEqual(res.metadata.ai_provider, 'fallback');
    } finally {
      process.env.AI_PROVIDER = origProvider;
      process.env.OPENAI_API_KEY = origOpenAiKey;
      process.env.GEMINI_API_KEY = origGeminiKey;
    }
  });

  // Restore AIJob methods
  AIJob.create = originalCreate;
  AIJob.findByIdAndUpdate = originalFindByIdAndUpdate;

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
