import assert from 'assert';
import { Readable } from 'stream';
import {
  uploadProductImageMiddleware,
  MAX_FILE_SIZE,
  MAX_USER_HINT_LENGTH,
} from '../src/middleware/imageUploadMiddleware.js';
import { analyzeProductImage } from '../src/modules/ai/vision.controller.js';
import { AiMicroserviceError } from '../src/services/aiMicroservice.client.js';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
      if (err.stack) {
        console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
      }
      failed++;
    });
}

/**
 * Construct raw multipart/form-data payload Buffer with given boundary.
 */
function buildMultipartBody(boundary, files = [], fields = {}) {
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
      )
    );
  }

  for (const f of files) {
    const filenamePart = f.filename !== undefined ? `; filename="${f.filename}"` : '';
    const contentTypePart = f.mimetype ? `Content-Type: ${f.mimetype}\r\n` : '';
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="${f.fieldname || 'image'}"${filenamePart}\r\n${contentTypePart}\r\n`;
    chunks.push(Buffer.from(header));
    chunks.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content || ''));
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

/**
 * Create a mock request stream from a body Buffer.
 */
function createMockReq({
  bodyBuffer = Buffer.alloc(0),
  contentType = '',
  tenant = null,
  headers = {},
}) {
  let offset = 0;
  const stream = new Readable({
    read(size) {
      if (offset >= bodyBuffer.length) {
        this.push(null);
        return;
      }
      const end = Math.min(offset + size, bodyBuffer.length);
      const chunk = bodyBuffer.subarray(offset, end);
      offset = end;
      this.push(chunk);
    },
  });

  stream.headers = {
    'content-type': contentType,
    ...headers,
  };
  stream.tenant = tenant;
  return stream;
}

/**
 * Create a mock response object capturing status and json.
 */
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      this.headersSent = true;
      return this;
    },
  };
  return res;
}

/**
 * Execute middleware wrapped in a Promise.
 */
function executeMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (nextCalled, err) => {
      if (!resolved) {
        resolved = true;
        resolve({ nextCalled, err });
      }
    };

    const origJson = res.json;
    res.json = function (data) {
      origJson.call(this, data);
      setImmediate(() => done(false, null));
      return this;
    };

    middleware(req, res, (err) => {
      done(true, err);
    });

    req.on('end', () => setTimeout(() => {
      if (res.headersSent) done(false, null);
    }, 50));
  });
}

console.log('====================================================');
console.log('AI IMAGE UPLOAD & VISION CONTROLLER TEST SUITE');
console.log('Phase 03.2: Real Image Upload & Python Vision Integration');
console.log('====================================================\n');

async function main() {
  // ----------------------------------------------------
  // SECTION 1: Multipart & Header Validation
  // ----------------------------------------------------
  console.log('--- SECTION 1: Multipart & Header Validation ---');

  await runTest('Rejects non-multipart Content-Type with MISSING_MULTIPART_BOUNDARY (400)', async () => {
    const req = createMockReq({ contentType: 'application/json' });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.code, 'MISSING_MULTIPART_BOUNDARY');
  });

  await runTest('Rejects missing Content-Type header with MISSING_MULTIPART_BOUNDARY (400)', async () => {
    const req = createMockReq({ contentType: '' });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'MISSING_MULTIPART_BOUNDARY');
  });

  await runTest('Rejects malformed multipart header without boundary with MALFORMED_MULTIPART_REQUEST (400)', async () => {
    const req = createMockReq({ contentType: 'multipart/form-data' }); // No boundary parameter!
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'MALFORMED_MULTIPART_REQUEST');
  });

  // ----------------------------------------------------
  // SECTION 2: Image Format & MIME Validation
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: Image Format & MIME Validation ---');

  const boundary = '----TestBoundary1234567890';
  const ctype = `multipart/form-data; boundary=${boundary}`;

  await runTest('Accepts valid JPEG image and populates req.file buffer', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'photo.jpg', mimetype: 'image/jpeg', content: jpegBuffer },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, true);
    assert.ok(req.file);
    assert.strictEqual(req.file.mimetype, 'image/jpeg');
    assert.strictEqual(req.file.originalname, 'photo.jpg');
    assert.strictEqual(req.file.size, jpegBuffer.length);
    assert.deepStrictEqual(req.file.buffer, jpegBuffer);
  });

  await runTest('Accepts valid PNG image and populates req.file buffer', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'vase.png', mimetype: 'image/png', content: pngBuffer },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, true);
    assert.ok(req.file);
    assert.strictEqual(req.file.mimetype, 'image/png');
    assert.strictEqual(req.file.originalname, 'vase.png');
  });

  await runTest('Accepts valid WebP image and populates req.file buffer', async () => {
    const webpBuffer = Buffer.from('RIFF....WEBPVP8 ');
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'craft.webp', mimetype: 'image/webp', content: webpBuffer },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, true);
    assert.ok(req.file);
    assert.strictEqual(req.file.mimetype, 'image/webp');
  });

  await runTest('Rejects unsupported GIF image with UNSUPPORTED_IMAGE_FORMAT (400)', async () => {
    const gifBuffer = Buffer.from('GIF89a...');
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'anim.gif', mimetype: 'image/gif', content: gifBuffer },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'UNSUPPORTED_IMAGE_FORMAT');
  });

  await runTest('Rejects non-image PDF with UNSUPPORTED_IMAGE_FORMAT (400)', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4...');
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'doc.pdf', mimetype: 'application/pdf', content: pdfBuffer },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'UNSUPPORTED_IMAGE_FORMAT');
  });

  // ----------------------------------------------------
  // SECTION 3: File Count & Size Limits
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: File Count & Size Limits ---');

  await runTest('Rejects request with no file uploaded with NO_IMAGE_PROVIDED (400)', async () => {
    const body = buildMultipartBody(boundary, [], { user_hint: 'handcrafted brass' });

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'NO_IMAGE_PROVIDED');
  });

  await runTest('Rejects empty file payload (0 bytes) with EMPTY_IMAGE_PAYLOAD (400)', async () => {
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'empty.jpg', mimetype: 'image/jpeg', content: Buffer.alloc(0) },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'EMPTY_IMAGE_PAYLOAD');
  });

  await runTest('Rejects oversized file (>10MB) during streaming with IMAGE_SIZE_LIMIT_EXCEEDED (400)', async () => {
    const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE + 1024, 0x41); // >10MB
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image', filename: 'huge.jpg', mimetype: 'image/jpeg', content: oversizedBuffer },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'IMAGE_SIZE_LIMIT_EXCEEDED');
  });

  await runTest('Rejects multiple files with MULTIPLE_FILES_REJECTED (400)', async () => {
    const file1 = Buffer.from([0xff, 0xd8, 0xff]);
    const file2 = Buffer.from([0x89, 0x50, 0x4e]);
    const body = buildMultipartBody(boundary, [
      { fieldname: 'image1', filename: '1.jpg', mimetype: 'image/jpeg', content: file1 },
      { fieldname: 'image2', filename: '2.png', mimetype: 'image/png', content: file2 },
    ]);

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'MULTIPLE_FILES_REJECTED');
  });

  // ----------------------------------------------------
  // SECTION 4: Text Field Limits & Stream Disconnection
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: Text Fields & Stream Cleanup ---');

  await runTest('Captures text fields into req.body correctly', async () => {
    const img = Buffer.from([0xff, 0xd8, 0xff]);
    const body = buildMultipartBody(
      boundary,
      [{ fieldname: 'image', filename: 'item.jpg', mimetype: 'image/jpeg', content: img }],
      { user_hint: 'Terracotta vase', enable_ocr: 'true' }
    );

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(req.body.user_hint, 'Terracotta vase');
    assert.strictEqual(req.body.enable_ocr, 'true');
  });

  await runTest('Rejects user_hint exceeding 500 characters with USER_HINT_TOO_LONG (400)', async () => {
    const img = Buffer.from([0xff, 0xd8, 0xff]);
    const longHint = 'A'.repeat(MAX_USER_HINT_LENGTH + 1);
    const body = buildMultipartBody(
      boundary,
      [{ fieldname: 'image', filename: 'item.jpg', mimetype: 'image/jpeg', content: img }],
      { user_hint: longHint }
    );

    const req = createMockReq({ bodyBuffer: body, contentType: ctype });
    const res = createMockRes();

    const { nextCalled } = await executeMiddleware(uploadProductImageMiddleware, req, res);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'USER_HINT_TOO_LONG');
  });

  await runTest('Handles client aborted event safely without unhandled error', async () => {
    const stream = new Readable({ read() {} });
    stream.headers = { 'content-type': ctype };
    const res = createMockRes();

    uploadProductImageMiddleware(stream, res, () => {});

    // Trigger abort
    stream.emit('aborted');
    assert.ok(true, 'Aborted cleanly without crashing');
  });

  // ----------------------------------------------------
  // SECTION 5: Controller & Tenant Context Propagation
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: Controller & Tenant Context Propagation ---');

  await runTest('Controller rejects request missing req.file with NO_IMAGE_PROVIDED (400)', async () => {
    const req = {
      tenant: { sellerId: 'seller_123' },
      body: {},
      headers: {},
    };
    const res = createMockRes();

    await analyzeProductImage(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'NO_IMAGE_PROVIDED');
  });

  await runTest('Controller rejects request missing tenant sellerId with UNAUTHORIZED_TENANT (401)', async () => {
    const req = {
      file: { buffer: Buffer.from([0xff, 0xd8]), originalname: 'test.jpg', mimetype: 'image/jpeg' },
      tenant: null, // missing tenant!
      body: { sellerId: 'attacker_fake_seller' }, // should be ignored!
      headers: {},
    };
    const res = createMockRes();

    await analyzeProductImage(req, res);

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.code, 'UNAUTHORIZED_TENANT');
  });

  // ----------------------------------------------------
  // SECTION 6: Error Mapping & Secret Redaction
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: Error Mapping & Secret Redaction ---');

  await runTest('Controller correctly handles and maps AiMicroserviceError status and code', async () => {
    const testSecret = 'secret_test_key_1234567890_32b_length';
    const fakeError = new AiMicroserviceError(
      `AI service error with secret ${testSecret}`,
      'AI_SERVICE_TIMEOUT',
      504,
      { url: 'http://localhost:8000' },
      testSecret
    );

    const req = {
      file: { buffer: Buffer.from([0xff, 0xd8]), originalname: 'test.jpg', mimetype: 'image/jpeg' },
      tenant: { sellerId: 'seller_valid_tenant' },
      body: {},
      headers: {},
    };
    const res = createMockRes();

    // Mock client error
    const origModule = await import('../src/services/aiMicroservice.client.js');
    const client = origModule.getAiMicroserviceClient();
    const origExtract = client.extractProductAttributes;

    client.extractProductAttributes = async () => {
      throw fakeError;
    };

    try {
      await analyzeProductImage(req, res);
      assert.strictEqual(res.statusCode, 504);
      assert.strictEqual(res.body.code, 'AI_SERVICE_TIMEOUT');
      assert.ok(!res.body.message.includes(testSecret), 'Secret must be redacted');
      assert.ok(
        res.body.message.includes('[REDACTED_SECRET]') || res.body.message.includes('REDACTED'),
        'Secret replaced by redaction placeholder'
      );
    } finally {
      client.extractProductAttributes = origExtract;
    }
  });

  await runTest('Controller maps successful vision intelligence extraction into successResponse without inventing fields', async () => {
    const mockVisionResult = {
      success: true,
      message: 'Product intelligence extraction completed successfully.',
      data: {
        product_type: 'Handcrafted Blue Pottery Vase',
        visual_description: 'Ceramic floral vase with cobalt blue and turquoise glaze.',
        multiple_products_detected: false,
        category: {
          primary_category: 'Home Decor',
          subcategory: 'Vases & Planters',
          alternative_categories: ['Handicrafts'],
          confidence: 0.95,
          uncertainty_status: 'confirmed_observation',
          reasoning: 'Characteristic Jaipur blue pottery glaze texture.',
        },
        attributes: [
          {
            name: 'primary_color',
            value: 'Cobalt Blue',
            confidence: 0.96,
            evidence_source: 'vision_model',
            uncertainty_status: 'confirmed_observation',
            notes: 'Dominant glaze color',
          },
          {
            name: 'apparent_material',
            value: 'Ceramic / Quartz Stone Paste',
            confidence: 0.89,
            evidence_source: 'vision_model',
            uncertainty_status: 'reasonable_inference',
            notes: 'Glazed quartz finish',
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
        uncertainties: ['Exact clay formulation cannot be determined visually.'],
        image_metadata: {
          width: 800,
          height: 1000,
          format: 'JPEG',
          size_bytes: 204800,
          aspect_ratio: 0.8,
          has_exif: false,
          channels: 3,
        },
        processing_metadata: {
          vision_provider: 'gemini',
          model_name: 'gemini-1.5-flash',
        },
      },
      request_id: 'req-test-12345',
    };

    const origModule = await import('../src/services/aiMicroservice.client.js');
    const client = origModule.getAiMicroserviceClient();
    const origExtract = client.extractProductAttributes;

    client.extractProductAttributes = async () => mockVisionResult;

    const req = {
      file: { buffer: Buffer.from([0xff, 0xd8]), originalname: 'vase.jpg', mimetype: 'image/jpeg' },
      tenant: { sellerId: 'seller_valid_tenant', storeId: 'store_abc' },
      body: { user_hint: 'Jaipur pottery' },
      headers: { 'x-request-id': 'req-test-12345' },
    };
    const res = createMockRes();

    try {
      await analyzeProductImage(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.vision);
      assert.strictEqual(res.body.data.vision.product_type, 'Handcrafted Blue Pottery Vase');
      assert.strictEqual(res.body.data.vision.category.confidence, 0.95);
      assert.strictEqual(res.body.data.vision.attributes.length, 2);
      assert.strictEqual(res.body.data.vision.ocr.status, 'no_text_detected');
      assert.strictEqual(res.body.data.vision.uncertainties.length, 1);
      assert.strictEqual(res.body.data.request_id, 'req-test-12345');

      // Verify NO database or hallucinated fields exist
      assert.strictEqual(res.body.data.vision.seo, undefined);
      assert.strictEqual(res.body.data.vision.keywords, undefined);
      assert.strictEqual(res.body.data.product, undefined);
    } finally {
      client.extractProductAttributes = origExtract;
    }
  });

  console.log('\n====================================================');
  console.log(`TEST SUITE RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
