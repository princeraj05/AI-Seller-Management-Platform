import assert from 'assert';
import {
  AiMicroserviceClient,
  AiMicroserviceError,
} from '../src/services/aiMicroservice.client.js';
import {
  validateProductIntelligenceResponse,
  validateVisionStatusResponse,
  BaseVisionResponseSchema,
  CategoryPredictionSchema,
  ExtractedAttributeSchema,
  ImageMetadataSchema,
} from '../src/services/aiMicroservice.schema.js';
import {
  validateAiServiceSecret,
  DEV_DEFAULT_AI_SECRET,
  EXAMPLE_PLACEHOLDER_AI_SECRET,
} from '../src/config/env.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// Fixture generating a valid ProductIntelligenceResult response
function createValidPythonResponse(overrides = {}) {
  return {
    success: true,
    message: 'Product image analyzed successfully',
    data: {
      product_type: 'Handcrafted Terracotta Vase',
      visual_description: 'Earthen terracotta clay floral vase with hand-painted patterns.',
      multiple_products_detected: false,
      category: {
        primary_category: 'Home Decor & Living',
        subcategory: 'Vases & Planters',
        alternative_categories: ['Handicrafts & Pottery'],
        confidence: 0.95,
        uncertainty_status: 'confirmed_observation',
        reasoning: 'Terracotta fired clay structure with visible floral motifs.',
      },
      attributes: [
        {
          name: 'primary_color',
          value: 'Terracotta Brown',
          confidence: 0.98,
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          notes: null,
        },
        {
          name: 'visible_material',
          value: 'Terracotta Clay',
          confidence: 0.96,
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          notes: null,
        },
      ],
      ocr: {
        status: 'no_text_detected',
        extracted_text: '',
        segments: [],
        segment_count: 0,
        engine: 'PaddleOCR',
        execution_time_ms: 120.5,
      },
      uncertainties: [],
      image_metadata: {
        width: 1200,
        height: 1600,
        format: 'JPEG',
        size_bytes: 345678,
        aspect_ratio: 0.75,
        has_exif: false,
        channels: 3,
      },
      processing_metadata: {
        total_duration_ms: 2450.0,
        vision_duration_ms: 2100.0,
        ocr_duration_ms: 120.5,
        vision_model: 'gemini-3.8-flash',
        fallback_triggered: false,
        circuit_breaker_state: 'closed',
        cache_hit: false,
        cached: true,
      },
      ...overrides,
    },
    request_id: 'req-test-uuid-1234',
  };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('AI MICROSERVICE CLIENT AUTOMATED TEST SUITE');
  console.log('Phase 03.1: Node.js ↔ Python Microservice Foundation');
  console.log('====================================================\n');

  // --- SECTION A: Configuration & Client Initialization ---
  console.log('--- SECTION A: Configuration & Client Initialization ---');

  it('Initializes with valid defaults and sets default timeout to 60000ms', () => {
    const client = new AiMicroserviceClient({
      url: 'http://127.0.0.1:8000',
      secret: 'test-secret-key-at-least-32-chars-long-abc',
    });
    assert.strictEqual(client.url, 'http://127.0.0.1:8000');
    assert.strictEqual(client.timeout, 60000);
    assert.strictEqual(client.secret, 'test-secret-key-at-least-32-chars-long-abc');
  });

  it('Accepts custom valid timeout', () => {
    const client = new AiMicroserviceClient({
      url: 'http://127.0.0.1:8000',
      secret: 'test-secret-key-at-least-32-chars-long-abc',
      timeout: 45000,
    });
    assert.strictEqual(client.timeout, 45000);
  });

  it('Rejects timeout of 0 with AI_SERVICE_CONFIG_ERROR', () => {
    assert.throws(
      () =>
        new AiMicroserviceClient({
          url: 'http://127.0.0.1:8000',
          secret: 'test-secret-key-at-least-32-chars-long-abc',
          timeout: 0,
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_CONFIG_ERROR'
    );
  });

  it('Rejects negative timeout with AI_SERVICE_CONFIG_ERROR', () => {
    assert.throws(
      () =>
        new AiMicroserviceClient({
          url: 'http://127.0.0.1:8000',
          secret: 'test-secret-key-at-least-32-chars-long-abc',
          timeout: -1000,
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_CONFIG_ERROR'
    );
  });

  it('Rejects non-integer/NaN timeout with AI_SERVICE_CONFIG_ERROR', () => {
    assert.throws(
      () =>
        new AiMicroserviceClient({
          url: 'http://127.0.0.1:8000',
          secret: 'test-secret-key-at-least-32-chars-long-abc',
          timeout: 'invalid_timeout',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_CONFIG_ERROR'
    );
  });

  it('Rejects invalid protocol URL (not http/https)', () => {
    assert.throws(
      () =>
        new AiMicroserviceClient({
          url: 'ftp://127.0.0.1:8000',
          secret: 'test-secret-key-at-least-32-chars-long-abc',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_CONFIG_ERROR'
    );
  });

  it('Rejects missing or empty secret with AI_SERVICE_CONFIG_ERROR', () => {
    assert.throws(
      () =>
        new AiMicroserviceClient({
          url: 'http://127.0.0.1:8000',
          secret: '',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_CONFIG_ERROR'
    );
  });

  // --- Production Secret Validation Tests ---
  it('Production secret validation: rejects missing secret (undefined)', () => {
    assert.throws(
      () => validateAiServiceSecret(undefined, true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET must be set and non-empty in production/
    );
  });

  it('Production secret validation: rejects empty secret ("")', () => {
    assert.throws(
      () => validateAiServiceSecret('', true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET must be set and non-empty in production/
    );
  });

  it('Production secret validation: rejects whitespace-only secret', () => {
    assert.throws(
      () => validateAiServiceSecret('   \t\n  ', true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET must be set and non-empty in production/
    );
  });

  it('Production secret validation: rejects short secret (<32 chars)', () => {
    assert.throws(
      () => validateAiServiceSecret('short_secret_under_32_chars', true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET must be at least 32 characters long in production/
    );
  });

  it('Production secret validation: rejects exact development default secret', () => {
    assert.throws(
      () => validateAiServiceSecret(DEV_DEFAULT_AI_SECRET, true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use the development default secret in production/
    );
  });

  it('Production secret validation: rejects whitespace-padded development default secret', () => {
    assert.throws(
      () => validateAiServiceSecret(`  ${DEV_DEFAULT_AI_SECRET}  \n`, true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use the development default secret in production/
    );
  });

  it('Production secret validation: rejects exact example placeholder secret', () => {
    assert.throws(
      () => validateAiServiceSecret(EXAMPLE_PLACEHOLDER_AI_SECRET, true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use the example placeholder secret in production/
    );
  });

  it('Production secret validation: rejects whitespace-padded example placeholder secret', () => {
    assert.throws(
      () => validateAiServiceSecret(`  ${EXAMPLE_PLACEHOLDER_AI_SECRET}  \t\n`, true),
      /CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use the example placeholder secret in production/
    );
  });

  it('Production secret validation: accepts valid non-default production secret and trims it', () => {
    const validProdSecret = '  prod_custom_secure_secret_key_1234567890_32b  ';
    const normalized = validateAiServiceSecret(validProdSecret, true);
    assert.strictEqual(normalized, 'prod_custom_secure_secret_key_1234567890_32b');
    assert.strictEqual(normalized.length, 44);
  });

  it('Production secret validation: accepts valid randomly generated secret of at least 32 characters', () => {
    const randomSecret = 'a9f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8';
    const normalized = validateAiServiceSecret(randomSecret, true);
    assert.strictEqual(normalized, randomSecret);
    assert.strictEqual(normalized.length, 64);
  });

  it('Development secret fallback: returns DEV_DEFAULT_AI_SECRET when missing or empty in development', () => {
    assert.strictEqual(validateAiServiceSecret(undefined, false), DEV_DEFAULT_AI_SECRET);
    assert.strictEqual(validateAiServiceSecret('', false), DEV_DEFAULT_AI_SECRET);
    assert.strictEqual(validateAiServiceSecret('   ', false), DEV_DEFAULT_AI_SECRET);
  });

  // --- SECTION B: Pre-flight Input Validation ---
  console.log('\n--- SECTION B: Pre-flight Input Validation ---');

  const validClient = new AiMicroserviceClient({
    url: 'http://127.0.0.1:8000',
    secret: 'test-secret-key-at-least-32-chars-long-abc',
  });

  await itAsync('Rejects missing image buffer with AI_SERVICE_INPUT_ERROR (400)', async () => {
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: null,
          sellerId: 'seller_123',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  await itAsync('Rejects empty image buffer (0 bytes) with AI_SERVICE_INPUT_ERROR (400)', async () => {
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: Buffer.alloc(0),
          sellerId: 'seller_123',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  await itAsync('Rejects oversized image buffer (>10MB) with AI_SERVICE_INPUT_ERROR (400)', async () => {
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: oversizedBuffer,
          sellerId: 'seller_123',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  await itAsync('Rejects unsupported MIME type (image/gif) with AI_SERVICE_INPUT_ERROR (400)', async () => {
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: Buffer.from('fake-image-bytes'),
          mimeType: 'image/gif',
          sellerId: 'seller_123',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  await itAsync('Rejects missing sellerId with AI_SERVICE_INPUT_ERROR (400)', async () => {
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: Buffer.from('fake-image-bytes'),
          mimeType: 'image/jpeg',
          sellerId: '',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  await itAsync('Rejects user hint exceeding 500 characters with AI_SERVICE_INPUT_ERROR (400)', async () => {
    const longHint = 'A'.repeat(501);
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: Buffer.from('fake-image-bytes'),
          mimeType: 'image/jpeg',
          sellerId: 'seller_123',
          userHint: longHint,
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  // --- SECTION C: Request Construction & Multipart Assembly ---
  console.log('\n--- SECTION C: Request Construction & Header Inspection ---');

  await itAsync('Constructs correct multipart request, headers, and propagated request ID', async () => {
    let capturedUrl = null;
    let capturedHeaders = null;
    let capturedBody = null;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      capturedBody = opts.body;

      return {
        ok: true,
        status: 200,
        json: async () => createValidPythonResponse(),
      };
    };

    try {
      const result = await validClient.extractProductAttributes({
        imageBuffer: Buffer.from('valid-image-bytes'),
        filename: 'vase.jpg',
        mimeType: 'image/jpeg',
        sellerId: 'seller_test_456',
        storeId: 'store_test_789',
        requestId: 'req-custom-999',
        enableOcr: true,
        userHint: 'Blue pottery vase from Jaipur',
      });

      assert.strictEqual(capturedUrl, 'http://127.0.0.1:8000/api/v1/vision/extract-attributes');
      assert.strictEqual(capturedHeaders['X-Internal-Service-Key'], 'test-secret-key-at-least-32-chars-long-abc');
      assert.strictEqual(capturedHeaders['X-Seller-ID'], 'seller_test_456');
      assert.strictEqual(capturedHeaders['X-Store-ID'], 'store_test_789');
      assert.strictEqual(capturedHeaders['X-Request-ID'], 'req-custom-999');
      assert.strictEqual(capturedHeaders['X-User-Role'], 'seller');
      assert(capturedBody instanceof FormData, 'Body should be a FormData instance');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.product_type, 'Handcrafted Terracotta Vase');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- SECTION D: Distinct Status Code & Error Mapping ---
  console.log('\n--- SECTION D: Distinct Status Code & Error Mapping ---');

  await itAsync('Maps request timeout to AI_SERVICE_TIMEOUT (504)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_TIMEOUT' && err.statusCode === 504
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Maps connection failure (ECONNREFUSED) to AI_SERVICE_UNAVAILABLE (503)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:8000');
      err.code = 'ECONNREFUSED';
      throw err;
    };

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_UNAVAILABLE' && err.statusCode === 503
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Maps HTTP 401 response to AI_SERVICE_AUTH_ERROR (401)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ success: false, message: 'Invalid internal service key', code: 'AUTHENTICATION_FAILED' }),
    });

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_AUTH_ERROR' && err.statusCode === 401
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Maps HTTP 403 response to AI_SERVICE_FORBIDDEN (403)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ success: false, message: 'Seller context required', code: 'AUTHORIZATION_FAILED' }),
    });

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_FORBIDDEN' && err.statusCode === 403
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Maps HTTP 422 response to AI_SERVICE_VALIDATION_ERROR (422)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ success: false, message: 'Corrupted image file', code: 'VALIDATION_ERROR' }),
    });

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_VALIDATION_ERROR' && err.statusCode === 422
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Maps HTTP 502/503 response to AI_SERVICE_UPSTREAM_ERROR (502)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({ success: false, message: 'Gemini upstream API failure', code: 'EXTERNAL_SERVICE_ERROR' }),
    });

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_UPSTREAM_ERROR' && err.statusCode === 502
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- SECTION E: Structural Schema Validation ---
  console.log('\n--- SECTION E: Strict Structural Schema Validation ---');

  await itAsync('Rejects malformed non-JSON response with AI_SERVICE_SCHEMA_ERROR', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token < in JSON');
      },
    });

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_SCHEMA_ERROR'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Rejects arbitrary JSON missing ProductIntelligenceResult fields with AI_SERVICE_SCHEMA_ERROR', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Fake success',
        data: {
          arbitrary: 'data', // Missing product_type, category, attributes, ocr, image_metadata
        },
      }),
    });

    try {
      await assert.rejects(
        async () =>
          validClient.extractProductAttributes({
            imageBuffer: Buffer.from('valid-image-bytes'),
            sellerId: 'seller_123',
          }),
        (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_SCHEMA_ERROR'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Strict schema validation: accepts valid complete response with legitimate nullable and optional fields', () => {
    const valid = createValidPythonResponse({
      category: {
        primary_category: 'Handicrafts',
        subcategory: 'Clay Vases',
        alternative_categories: [], // Empty array allowed
        confidence: 0.92,
        uncertainty_status: 'confirmed_observation',
        reasoning: 'Terracotta fired structure',
      },
      attributes: [
        {
          name: 'color',
          value: 'brown',
          confidence: 0.9,
          evidence_source: 'vision_model',
          uncertainty_status: 'confirmed_observation',
          notes: null, // Legitimate null
        },
      ],
    });
    const parsed = validateProductIntelligenceResponse(valid);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.data.attributes[0].notes, null);
    assert.deepStrictEqual(parsed.data.category.alternative_categories, []);
  });

  it('Strict schema validation: rejects unexpected top-level field with Zod unrecognized_keys error', () => {
    const invalidTop = createValidPythonResponse();
    invalidTop.unexpected_top_level_field = 'malicious_or_unknown';
    assert.throws(
      () => validateProductIntelligenceResponse(invalidTop),
      (err) => err.name === 'ZodError' && err.issues.some((i) => i.code === 'unrecognized_keys')
    );
  });

  it('Strict schema validation: rejects unexpected nested field in category with Zod unrecognized_keys error', () => {
    const invalidCat = createValidPythonResponse();
    invalidCat.data.category.unexpected_category_field = 'bogus';
    assert.throws(
      () => validateProductIntelligenceResponse(invalidCat),
      (err) => err.name === 'ZodError' && err.issues.some((i) => i.code === 'unrecognized_keys')
    );
  });

  it('Strict schema validation: rejects unexpected nested field in attributes with Zod unrecognized_keys error', () => {
    const invalidAttr = createValidPythonResponse();
    invalidAttr.data.attributes[0].unexpected_attribute_field = 999;
    assert.throws(
      () => validateProductIntelligenceResponse(invalidAttr),
      (err) => err.name === 'ZodError' && err.issues.some((i) => i.code === 'unrecognized_keys')
    );
  });

  it('Strict schema validation: rejects unexpected field in image_metadata with Zod unrecognized_keys error', () => {
    const invalidMeta = createValidPythonResponse();
    invalidMeta.data.image_metadata.unexpected_meta_field = 'bad';
    assert.throws(
      () => validateProductIntelligenceResponse(invalidMeta),
      (err) => err.name === 'ZodError' && err.issues.some((i) => i.code === 'unrecognized_keys')
    );
  });

  it('Strict schema validation: preserves intentionally flexible processing_metadata fields', () => {
    const flexMeta = createValidPythonResponse({
      processing_metadata: {
        custom_engine_metric: 42,
        vision_model: 'gemini-3.8-flash',
        nested_diagnostics: { a: 1, b: 'info' },
      },
    });
    const parsed = validateProductIntelligenceResponse(flexMeta);
    assert.strictEqual(parsed.data.processing_metadata.custom_engine_metric, 42);
    assert.strictEqual(parsed.data.processing_metadata.nested_diagnostics.b, 'info');
  });

  it('Zod status schema validator correctly validates a vision status response', () => {
    const statusPayload = {
      success: true,
      message: 'Vision diagnostic status',
      data: {
        ready: true,
        vision_provider: 'gemini',
        ocr_enabled: true,
      },
      request_id: 'req-status-123',
    };
    const validated = validateVisionStatusResponse(statusPayload);
    assert.strictEqual(validated.success, true);
    assert.strictEqual(validated.data.ready, true);
  });

  // --- SECTION F: Security & Secret Protection ---
  console.log('\n--- SECTION F: Security & Secret Redaction ---');

  it('Redacts global internal service secret if it appears in error messages or details', () => {
    const sensitiveSecret = 'dev_internal_ai_service_secret_key_change_in_production_32b';
    const err = new AiMicroserviceError(
      `Failed to authenticate using key: ${sensitiveSecret}`,
      'AI_SERVICE_AUTH_ERROR',
      401,
      { leakedKey: sensitiveSecret }
    );

    assert(!err.message.includes(sensitiveSecret), 'Error message must not contain raw secret');
    assert(err.message.includes('[REDACTED_SECRET]'), 'Secret should be replaced with [REDACTED_SECRET]');
    assert.strictEqual(err.details.leakedKey, '[REDACTED_SECRET]', 'Details object must redact secret');
  });

  it('Redacts custom client-specific secret differing from global configuration secret in messages and details', () => {
    const customSecret = 'custom_unique_client_secret_9876543210_32chars!';
    const clientWithCustomSecret = new AiMicroserviceClient({
      url: 'http://127.0.0.1:8000',
      secret: customSecret,
    });

    const err = clientWithCustomSecret._createError(
      `Network dispatch failed with secret ${customSecret}`,
      'AI_SERVICE_AUTH_ERROR',
      401,
      { embeddedSecret: customSecret, info: 'token leak attempt' }
    );

    // Verify neither message nor details contains raw custom secret
    assert(!err.message.includes(customSecret), 'Error message must not contain raw custom secret');
    assert(err.message.includes('[REDACTED_SECRET]'), 'Custom secret in message must be replaced with [REDACTED_SECRET]');
    assert.strictEqual(err.details.embeddedSecret, '[REDACTED_SECRET]', 'Details object must redact custom secret');
    assert(!JSON.stringify(err.details).includes(customSecret), 'Serialized details must not contain raw custom secret');
  });

  // --- SECTION G: Health Probe ---
  console.log('\n--- SECTION G: Health & Readiness Probe ---');

  await itAsync('Health check succeeds and maps readiness correctly', async () => {
    let capturedSecret = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      capturedSecret = opts.headers['X-Internal-Service-Key'];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'Diagnostic status',
          data: {
            ready: true,
            vision_ready: true,
            ocr_library_installed: true,
          },
          request_id: 'req-probe-1',
        }),
      };
    };

    try {
      const probe = await validClient.checkHealth();
      assert.strictEqual(capturedSecret, 'test-secret-key-at-least-32-chars-long-abc');
      assert.strictEqual(probe.available, true);
      assert.strictEqual(probe.status.ready, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- SECTION H: Tenant Isolation & Request Context ---
  console.log('\n--- SECTION H: Tenant Isolation & Per-Request Context ---');

  await itAsync('Enforces tenant isolation and independent headers across consecutive calls without state leakage', async () => {
    const requestsReceived = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      requestsReceived.push({
        sellerId: opts.headers['X-Seller-ID'],
        storeId: opts.headers['X-Store-ID'],
        requestId: opts.headers['X-Request-ID'],
      });
      return {
        ok: true,
        status: 200,
        json: async () => createValidPythonResponse(),
      };
    };

    try {
      // Call 1: Seller A with storeId
      await validClient.extractProductAttributes({
        imageBuffer: Buffer.from('image-a'),
        sellerId: 'seller_AAA_111',
        storeId: 'store_AAA_999',
        requestId: 'req_AAA',
      });

      // Call 2: Seller B without storeId
      await validClient.extractProductAttributes({
        imageBuffer: Buffer.from('image-b'),
        sellerId: 'seller_BBB_222',
        requestId: 'req_BBB',
      });

      assert.strictEqual(requestsReceived.length, 2);

      // Verify Call 1 received Seller A credentials
      assert.strictEqual(requestsReceived[0].sellerId, 'seller_AAA_111');
      assert.strictEqual(requestsReceived[0].storeId, 'store_AAA_999');
      assert.strictEqual(requestsReceived[0].requestId, 'req_AAA');

      // Verify Call 2 received Seller B credentials and NO storeId from Call 1
      assert.strictEqual(requestsReceived[1].sellerId, 'seller_BBB_222');
      assert.strictEqual(requestsReceived[1].storeId, undefined, 'Store ID from previous call must not leak');
      assert.strictEqual(requestsReceived[1].requestId, 'req_BBB');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await itAsync('Rejects empty or whitespace-only sellerId without substituting tenant identity', async () => {
    await assert.rejects(
      async () =>
        validClient.extractProductAttributes({
          imageBuffer: Buffer.from('valid-image-bytes'),
          sellerId: '   ',
        }),
      (err) => err instanceof AiMicroserviceError && err.code === 'AI_SERVICE_INPUT_ERROR' && err.statusCode === 400
    );
  });

  // --- SUMMARY ---
  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
