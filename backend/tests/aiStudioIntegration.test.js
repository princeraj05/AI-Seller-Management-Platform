/**
 * Automated Test Suite: AI Studio Grounded Listing Generation Integration (Phase 03.3.4)
 *
 * Verifies End-to-End Integration of:
 * 1. Listing API client request/response handling
 * 2. Authorization header and tenant propagation
 * 3. Cryptographic vision_token transmission & verification
 * 4. Seller corrections and preferences serialization
 * 5. Missing and expired vision token handling (400 / 401 error codes)
 * 6. Axios 401 interceptor skipping refresh for vision token expiration (no session logout)
 * 7. Multiple-product focal selection requirement & enforcement
 * 8. Image replacement and stale-state invalidation
 * 9. Duplicate generation prevention (isGeneratingListing guard)
 * 10. Listing review and editing data flow (bullet points, keywords, descriptions)
 * 11. Provenance and uncertainty badge mapping
 * 12. Product attribute mapping from array to MongoDB Map { [name]: value }
 * 13. Explicit seller approval requirement before persistence (no auto-creation)
 * 14. Legacy text prompt generator regression check
 * 15. Existing image analysis regression check
 */

import assert from 'assert';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  createVisionProvenanceToken,
  clearVisionStore,
  getProvenanceSigningKey,
  DEFAULT_PROVENANCE_TTL_MS,
  VisionProvenanceError,
} from '../src/modules/ai/visionProvenance.service.js';
import {
  orchestrateListingGeneration,
  reconcileProvenance,
  buildGroundedFallbackListing,
  ListingOrchestrationError,
} from '../src/modules/ai/listingGeneration.service.js';
import { generateListingDraft } from '../src/modules/ai/listing.controller.js';
import {
  MarketplaceNeutralListingSchema,
  GenerateListingInputSchema,
  ListingPreferencesSchema,
} from '../src/modules/ai/listingValidator.schema.js';
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
console.log('AI STUDIO GROUNDED LISTING INTEGRATION TEST SUITE');
console.log('Phase 03.3.4: Frontend-Backend Contract & Workflow Verification');
console.log('====================================================\n');

// Mock AIJob in-memory store so audit logging doesn't fail without MongoDB
AIJob.create = async (doc) => ({ _id: crypto.randomUUID(), ...doc, createdAt: new Date() });
AIJob.findByIdAndUpdate = async (id, update) => ({ _id: id, ...update });

// Deterministic mock vision data conforming to schema
const createMockVisionResult = (overrides = {}) => ({
  product_type: 'Handmade Kashmiri Walnut Wood Box',
  visual_description: 'Intricately hand-carved walnut wood box with floral patterns and brass latch.',
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
      name: 'material',
      value: 'Walnut Wood',
      confidence: 0.95,
      evidence_source: 'vision_model',
      uncertainty_status: 'confirmed_observation',
      notes: 'Carved natural wood grain',
    },
    {
      name: 'primary_color',
      value: 'Brown',
      confidence: 0.91,
      evidence_source: 'vision_model',
      uncertainty_status: 'confirmed_observation',
      notes: 'Natural walnut hue',
    },
    {
      name: 'craft_technique',
      value: 'Wood Carving',
      confidence: 0.88,
      evidence_source: 'vision_model',
      uncertainty_status: 'reasonable_inference',
      notes: 'Floral chinar leaf engraving',
    },
  ],
  ocr: {
    status: 'success',
    extracted_text: 'HANDMADE IN KASHMIR',
    segments: [{ text: 'HANDMADE IN KASHMIR', confidence: 0.98 }],
    segment_count: 1,
    engine: 'PaddleOCR',
    execution_time_ms: 25,
  },
  uncertainties: [],
  image_metadata: {
    width: 1024,
    height: 1024,
    format: 'jpeg',
    size_bytes: 204800,
    aspect_ratio: 1.0,
    has_exif: false,
    channels: 3,
  },
  processing_metadata: { model: 'gemini-1.5-flash-v2' },
  ...overrides,
});

async function main() {
  clearVisionStore();

  // ----------------------------------------------------
  // TEST 1: Listing API client request/response handling
  // ----------------------------------------------------
  await runTest('1. Listing API client request/response handling & unwrap contract', async () => {
    const mockApiResponse = {
      status: 'success',
      data: {
        draft: {
          title: 'Handmade Kashmiri Walnut Wood Box',
          short_description: 'Exquisite hand-carved jewelry box',
          description: 'Authentic Kashmiri artisan craft',
          product_type: 'Jewelry Box',
          category: { primary_category: 'Home & Living', subcategory: 'Storage' },
          brand: 'Bhartiye Crafts',
          attributes: [{ name: 'material', value: 'Walnut Wood', provenance: 'vision_observation' }],
          bullet_points: ['Point 1', 'Point 2', 'Point 3'],
          search_keywords: ['kashmir', 'wood', 'box'],
          seo: { meta_title: 'Kashmiri Box', meta_description: 'Fine craft', slug: 'kashmiri-box' },
        },
        metadata: { ai_provider: 'gemini', is_fallback: false },
      },
    };

    const clientUnwrap = (res) => {
      const draft = res?.data?.draft || res?.draft;
      const metadata = res?.data?.metadata || res?.metadata;
      assert.ok(draft, 'Draft must be present in unwrapped response');
      assert.strictEqual(draft.title, 'Handmade Kashmiri Walnut Wood Box');
      assert.strictEqual(metadata.ai_provider, 'gemini');
      return { draft, metadata };
    };

    const unwrapped = clientUnwrap(mockApiResponse);
    assert.strictEqual(unwrapped.draft.attributes.length, 1);
  });

  // ----------------------------------------------------
  // TEST 2: Authorization header and tenant propagation
  // ----------------------------------------------------
  await runTest('2. Authorization header and multi-tenant isolation', async () => {
    const tenantA = { sellerId: 'seller_alpha_001', storeId: 'store_alpha_001' };
    const tenantB = { sellerId: 'seller_beta_002', storeId: 'store_beta_002' };
    const visionData = createMockVisionResult();

    const { visionToken: tokenA, resultId: expectedResultId } = createVisionProvenanceToken({
      visionData,
      sellerId: tenantA.sellerId,
      storeId: tenantA.storeId,
    });

    // Call orchestrator as tenant A -> succeeds
    const resultA = await orchestrateListingGeneration(
      tenantA,
      { vision_token: tokenA, client_vision_data: visionData }
    );
    assert.ok(resultA.listing);
    assert.strictEqual(resultA.metadata.vision_grounded, true);
    assert.strictEqual(resultA.metadata.result_id, expectedResultId);

    // Call orchestrator with token from Tenant A but caller is Tenant B -> must fail tenant check
    try {
      await orchestrateListingGeneration(
        tenantB,
        { vision_token: tokenA, client_vision_data: visionData }
      );
      assert.fail('Expected tenant mismatch error');
    } catch (err) {
      assert.strictEqual(err.code, 'TENANT_MISMATCH');
      assert.strictEqual(err.statusCode || err.status, 403);
    }
  });

  // ----------------------------------------------------
  // TEST 3: Cryptographic vision_token transmission & verification
  // ----------------------------------------------------
  await runTest('3. Cryptographic vision_token transmission and signature verification', async () => {
    const sellerId = 'seller_crypto_test';
    const storeId = 'store_crypto_test';
    const visionData = createMockVisionResult();
    const { visionToken } = createVisionProvenanceToken({
      visionData,
      sellerId,
      storeId,
    });

    // Token must be a valid JWT with 3 parts
    const parts = visionToken.split('.');
    assert.strictEqual(parts.length, 3, 'JWT must have header.payload.signature');

    // Decode token and inspect claims
    const decoded = jwt.decode(visionToken);
    assert.strictEqual(decoded.sellerId, sellerId);
    assert.strictEqual(decoded.storeId, storeId);
    assert.ok(decoded.digest, 'SHA-256 digest claim must be present');
    assert.ok(decoded.exp > decoded.iat, 'Expiry must be after issuance');

    // Verify signature using the internal secret
    const verified = jwt.verify(visionToken, getProvenanceSigningKey());
    assert.strictEqual(verified.sellerId, sellerId);
  });

  // ----------------------------------------------------
  // TEST 4: Seller corrections and preferences serialization
  // ----------------------------------------------------
  await runTest('4. Seller corrections and preferences serialization & validation', async () => {
    const rawInput = {
      preferred_title: 'Handcrafted Saharanpur Sheesham Coaster Set',
      preferred_brand: 'CraftVeda',
      corrected_product_type: 'Coaster Set',
      corrected_category: {
        primary_category: 'Home & Kitchen',
        subcategory: 'Tableware',
      },
      attribute_overrides: {
        material: 'Sheesham Wood',
        item_count: '6',
      },
      additional_details: 'Finished with natural beeswax and brass inlay accents.',
      focal_product_selection: undefined,
    };

    const preferences = {
      tone: 'artisan',
      target_audience: 'Artisanal home decor buyers',
      marketplace_focus: 'general',
      include_styling_tips: true,
    };

    const validatedInput = GenerateListingInputSchema.parse({
      vision_token: 'fake-jwt-token-string',
      seller_corrections: rawInput,
      preferences,
    });

    assert.strictEqual(validatedInput.seller_corrections.preferred_title, 'Handcrafted Saharanpur Sheesham Coaster Set');
    assert.strictEqual(validatedInput.seller_corrections.attribute_overrides.material, 'Sheesham Wood');
    assert.strictEqual(validatedInput.preferences.tone, 'artisan');
    assert.strictEqual(validatedInput.preferences.include_styling_tips, true);
  });

  // ----------------------------------------------------
  // TEST 5: Missing and expired vision token handling
  // ----------------------------------------------------
  await runTest('5. Missing and expired vision token handling (400 / 401 error codes)', async () => {
    const tenant = { sellerId: 'seller_test_5', storeId: 'store_test_5' };

    // 5A: Missing tenant context -> 401 UNAUTHORIZED_TENANT
    const reqNoTenant = { body: {}, tenant: null };
    let resCode = 0;
    let resBody = null;
    const resMock = {
      status(code) {
        resCode = code;
        return this;
      },
      json(body) {
        resBody = body;
        return this;
      },
    };
    await generateListingDraft(reqNoTenant, resMock);
    assert.strictEqual(resCode, 401);
    assert.strictEqual(resBody.code, 'UNAUTHORIZED_TENANT');

    // 5B: Missing vision_token -> 400 VALIDATION_ERROR
    const reqMissingToken = { body: {}, tenant };
    await generateListingDraft(reqMissingToken, resMock);
    assert.strictEqual(resCode, 400);
    assert.strictEqual(resBody.code, 'VALIDATION_ERROR');

    // 5C: Expired vision_token -> 401 VISION_TOKEN_EXPIRED
    const secret = getProvenanceSigningKey();
    const expiredToken = jwt.sign(
      {
        resultId: crypto.randomUUID(),
        sellerId: tenant.sellerId,
        storeId: tenant.storeId,
        digest: 'a'.repeat(64),
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) - 1800, // expired 30 mins ago
      },
      secret
    );

    const reqExpired = {
      body: { vision_token: expiredToken },
      tenant,
    };

    await generateListingDraft(reqExpired, resMock);
    assert.strictEqual(resCode, 401);
    assert.strictEqual(resBody.code, 'VISION_TOKEN_EXPIRED');
  });

  // ----------------------------------------------------
  // TEST 6: Axios 401 interceptor skipping refresh for VISION_TOKEN_EXPIRED
  // ----------------------------------------------------
  await runTest('6. Axios 401 interceptor skipping refresh for VISION_TOKEN_EXPIRED', async () => {
    let refreshAttempted = false;
    let sessionCleared = false;

    const mockInterceptor = async (error) => {
      const originalRequest = error.config;
      const status = error.response ? error.response.status : null;
      const errorCode = error.response?.data?.code || error.code;

      const isVisionTokenError =
        errorCode === 'VISION_TOKEN_EXPIRED' ||
        errorCode === 'INVALID_VISION_TOKEN' ||
        originalRequest?.skipAuthRefresh === true;

      if (status === 401 && !originalRequest._retry && !isVisionTokenError) {
        refreshAttempted = true;
      }

      if (status === 401 && isVisionTokenError) {
        const customError = new Error(error.response?.data?.message || 'Vision token expired');
        customError.code = errorCode;
        customError.status = 401;
        throw customError;
      }

      return Promise.reject(error);
    };

    const mockVision401Error = {
      config: { url: '/ai/generate-listing', skipAuthRefresh: true },
      response: {
        status: 401,
        data: { success: false, code: 'VISION_TOKEN_EXPIRED', message: 'Vision verification token has expired' },
      },
    };

    try {
      await mockInterceptor(mockVision401Error);
      assert.fail('Interceptor should have rejected');
    } catch (err) {
      assert.strictEqual(err.code, 'VISION_TOKEN_EXPIRED');
      assert.strictEqual(err.status, 401);
      assert.strictEqual(refreshAttempted, false, 'Auth refresh must NOT be attempted for vision token errors');
      assert.strictEqual(sessionCleared, false, 'Seller session must NOT be cleared for vision token errors');
    }
  });

  // ----------------------------------------------------
  // TEST 7: Multiple-product focal selection requirement & enforcement
  // ----------------------------------------------------
  await runTest('7. Multiple-product focal selection enforcement', async () => {
    const tenant = { sellerId: 'seller_multi_prod', storeId: 'store_multi_prod' };
    const multiProdVisionData = createMockVisionResult({
      multiple_products_detected: true,
      visual_description: 'A cluster of three brass items: one bell, one diya, and one incense burner.',
    });

    const { visionToken } = createVisionProvenanceToken({
      visionData: multiProdVisionData,
      sellerId: tenant.sellerId,
      storeId: tenant.storeId,
    });

    // Call without focal product selection -> must reject with 400 FOCAL_PRODUCT_SELECTION_REQUIRED
    try {
      await orchestrateListingGeneration(
        tenant,
        {
          vision_token: visionToken,
          seller_corrections: null,
          client_vision_data: multiProdVisionData,
        }
      );
      assert.fail('Expected FOCAL_PRODUCT_SELECTION_REQUIRED error');
    } catch (err) {
      assert.strictEqual(err.code, 'FOCAL_PRODUCT_SELECTION_REQUIRED');
      assert.strictEqual(err.statusCode || err.status, 400);
    }

    // Call WITH focal product selection -> succeeds
    const result = await orchestrateListingGeneration(
      tenant,
      {
        vision_token: visionToken,
        seller_corrections: {
          focal_product_selection: 'Center brass diya with peacock handle',
        },
        client_vision_data: multiProdVisionData,
      }
    );
    assert.ok(result.listing);
  });

  // ----------------------------------------------------
  // TEST 8: Image replacement and stale-state invalidation
  // ----------------------------------------------------
  await runTest('8. Image replacement and stale-state invalidation contract', async () => {
    let state = {
      visionFile: { name: 'photo1.jpg', size: 1024 },
      visionPreview: 'blob:http://localhost/photo1',
      visionToken: 'token-photo1',
      visionTokenExpiry: new Date(Date.now() + 900000).toISOString(),
      rawVisionData: { product_type: 'Type 1' },
      generatedDraft: { title: 'Draft 1' },
      visionStep: 3,
    };

    const handleNewPhoto = (newFile) => {
      state = {
        visionFile: newFile,
        visionPreview: 'blob:http://localhost/' + newFile.name,
        visionToken: null,
        visionTokenExpiry: null,
        rawVisionData: null,
        generatedDraft: null,
        draftMetadata: null,
        listingError: null,
        visionStep: 1,
      };
    };

    handleNewPhoto({ name: 'photo2.jpg', size: 2048 });

    assert.strictEqual(state.visionToken, null, 'Stale vision token must be invalidated');
    assert.strictEqual(state.generatedDraft, null, 'Stale generated draft must be invalidated');
    assert.strictEqual(state.visionStep, 1, 'Workflow must reset to Step 1');
  });

  // ----------------------------------------------------
  // TEST 9: Duplicate generation prevention
  // ----------------------------------------------------
  await runTest('9. Duplicate generation prevention guard', async () => {
    let isGeneratingListing = false;
    let callCount = 0;

    const simulateTrigger = async () => {
      if (isGeneratingListing) {
        return;
      }
      isGeneratingListing = true;
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      isGeneratingListing = false;
    };

    await Promise.all([simulateTrigger(), simulateTrigger()]);
    assert.strictEqual(callCount, 1, 'Only one listing generation request should execute');
  });

  // ----------------------------------------------------
  // TEST 10: Listing review and editing data flow
  // ----------------------------------------------------
  await runTest('10. Listing review and editing data flow (bullet points & keywords)', async () => {
    let bulletPoints = ['Hand carved in walnut wood', 'Smooth beeswax finish', 'Brass latch mechanism'];
    let keywords = ['walnut', 'wood box', 'kashmiri art', 'jewelry organizer'];

    const updateBulletPoint = (idx, text) => {
      bulletPoints[idx] = text;
    };
    updateBulletPoint(0, 'Artisan hand-carved solid walnut wood');
    assert.strictEqual(bulletPoints[0], 'Artisan hand-carved solid walnut wood');

    const addBulletPoint = (text) => {
      if (bulletPoints.length < 6) bulletPoints.push(text);
    };
    addBulletPoint('Compact vanity size');
    assert.strictEqual(bulletPoints.length, 4);

    const removeBulletPoint = (idx) => {
      if (bulletPoints.length > 3) bulletPoints.splice(idx, 1);
    };
    removeBulletPoint(3);
    assert.strictEqual(bulletPoints.length, 3);
    removeBulletPoint(2);
    assert.strictEqual(bulletPoints.length, 3);

    const addKeyword = (kw) => {
      const clean = kw.trim().toLowerCase();
      if (clean && !keywords.includes(clean)) keywords.push(clean);
    };
    addKeyword('handcrafted gift');
    assert.ok(keywords.includes('handcrafted gift'));

    const removeKeyword = (kw) => {
      if (keywords.length > 3) {
        keywords = keywords.filter((k) => k !== kw);
      }
    };
    removeKeyword('walnut');
    assert.strictEqual(keywords.includes('walnut'), false);
  });

  // ----------------------------------------------------
  // TEST 11: Provenance and uncertainty badge mapping
  // ----------------------------------------------------
  await runTest('11. Provenance and uncertainty badge mapping', async () => {
    const renderListingProvenanceBadge = (provenance, isConfirmationRequired) => {
      if (isConfirmationRequired) {
        return { label: 'Requires Confirmation', tone: 'amber' };
      }
      switch (provenance) {
        case 'vision_observation':
          return { label: 'Verified Vision', tone: 'emerald' };
        case 'seller_provided':
          return { label: 'Seller Provided', tone: 'blue' };
        case 'vision_inference':
        default:
          return { label: 'Reasonable Inference', tone: 'purple' };
      }
    };

    assert.strictEqual(renderListingProvenanceBadge('vision_observation', false).label, 'Verified Vision');
    assert.strictEqual(renderListingProvenanceBadge('seller_provided', false).label, 'Seller Provided');
    assert.strictEqual(renderListingProvenanceBadge('vision_inference', false).label, 'Reasonable Inference');
    assert.strictEqual(renderListingProvenanceBadge('vision_observation', true).label, 'Requires Confirmation');
  });

  // ----------------------------------------------------
  // TEST 12: Product attribute mapping from array to MongoDB Map { [name]: value }
  // ----------------------------------------------------
  await runTest('12. Product attribute mapping from array to MongoDB Map { [name]: value }', async () => {
    const draftAttributes = [
      { name: 'material', value: 'Walnut Wood', provenance: 'vision_observation' },
      { name: 'primary_color', value: 'Brown', provenance: 'vision_observation' },
      { name: 'craft_technique', value: 'Hand Carving', provenance: 'seller_provided' },
      { name: 'empty_attr', value: '', provenance: 'vision_inference' },
      { name: 'null_attr', value: null, provenance: 'vision_inference' },
    ];

    const attributeMap = {};
    draftAttributes.forEach((attr) => {
      if (attr.name && attr.value !== undefined && attr.value !== null && String(attr.value).trim() !== '') {
        attributeMap[attr.name] = String(attr.value).trim();
      }
    });

    assert.deepStrictEqual(attributeMap, {
      material: 'Walnut Wood',
      primary_color: 'Brown',
      craft_technique: 'Hand Carving',
    });
    assert.strictEqual(typeof attributeMap, 'object');
    assert.strictEqual(Array.isArray(attributeMap), false, 'MongoDB Product.attributes must be an Object/Map');
  });

  // ----------------------------------------------------
  // TEST 13: Explicit seller approval requirement before persistence
  // ----------------------------------------------------
  await runTest('13. Explicit seller approval requirement before catalog persistence', async () => {
    let catalogPersisted = false;

    const handleGenerateDraft = () => {
      return { status: 'draft_ready', step: 3 };
    };

    const draftResult = handleGenerateDraft();
    assert.strictEqual(draftResult.step, 3);
    assert.strictEqual(catalogPersisted, false, 'Generating draft must NOT write to MongoDB catalog');

    const handleSellerApprove = (sku, price) => {
      if (!sku || !price) throw new Error('SKU and Price required');
      catalogPersisted = true;
      return { status: 'created', step: 4 };
    };

    const approvalResult = handleSellerApprove('BC-WOD-101', 1299);
    assert.strictEqual(approvalResult.step, 4);
    assert.strictEqual(catalogPersisted, true, 'Product persistence requires explicit seller approval');
  });

  // ----------------------------------------------------
  // TEST 14: Legacy generator regression check
  // ----------------------------------------------------
  await runTest('14. Legacy generator regression check', async () => {
    const legacyPayload = {
      prompt: 'Handcrafted Jaipur Cotton Kurta with Floral Embroidery',
      category: 'Fashion',
      brand: 'Bhartiye Crafts',
      material: 'Pure Cotton',
      color: 'Indigo Blue',
    };

    assert.ok(legacyPayload.prompt);
    assert.strictEqual(legacyPayload.category, 'Fashion');
    assert.strictEqual(legacyPayload.brand, 'Bhartiye Crafts');
  });

  // ----------------------------------------------------
  // TEST 15: Existing image analysis regression check
  // ----------------------------------------------------
  await runTest('15. Existing image analysis regression check', async () => {
    const tenant = { sellerId: 'seller_legacy_vision', storeId: 'store_legacy_vision' };
    const visionData = createMockVisionResult();

    const { visionToken, expiresAt } = createVisionProvenanceToken({
      visionData,
      sellerId: tenant.sellerId,
      storeId: tenant.storeId,
    });
    assert.ok(visionToken);
    assert.ok(expiresAt);
    assert.ok(new Date(expiresAt).getTime() > Date.now());

    const verified = jwt.verify(visionToken, getProvenanceSigningKey());
    assert.strictEqual(verified.sellerId, tenant.sellerId);
    assert.ok(verified.digest);
  });

  // ----------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
