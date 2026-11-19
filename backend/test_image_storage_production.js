/**
 * Production image storage policy tests.
 * Uses env toggling + mocked fetch for deterministic Cloudinary success/failure.
 * Optional live test: set RUN_LIVE_CLOUDINARY=1 (requires real credentials + network).
 */
import assert from 'assert';
import fs from 'fs';
import './src/config/env.js';
import { uploadImageToCloudinary } from './src/config/cloudinary.js';
import { getStorageMode, isPublicHttpsUrl, isLocalOrRelativeUrl } from './src/config/storage.js';
import { sanitizeProductImages } from './src/modules/products/product.service.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const SAVED = { ...process.env };
const realFetch = globalThis.fetch;
let passed = 0;
let failed = 0;

const setEnv = ({ prod = false, cloud = false, persistent = false } = {}) => {
  process.env.NODE_ENV = prod ? 'production' : 'development';
  if (cloud) {
    process.env.CLOUDINARY_CLOUD_NAME = 'testcloud';
    process.env.CLOUDINARY_API_KEY = 'k';
    process.env.CLOUDINARY_API_SECRET = 's';
  } else {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  }
  if (persistent) {
    process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION = 'true';
    process.env.PERSISTENT_UPLOAD_DIR = './uploads';
  } else {
    delete process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION;
    delete process.env.PERSISTENT_UPLOAD_DIR;
  }
};

const restore = () => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
  globalThis.fetch = realFetch;
};

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}\n    ${err.message}`);
    failed++;
  } finally {
    restore();
  }
}

console.log('\n=== PRODUCTION IMAGE STORAGE TEST SUITE ===\n');

await test('1. Cloudinary upload success returns secure_url + public_id (tenant folder)', async () => {
  setEnv({ cloud: true });
  let sentFolder = null;
  globalThis.fetch = async (url, opts) => {
    sentFolder = opts.body.get('folder');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        secure_url: 'https://res.cloudinary.com/testcloud/image/upload/v1/sellers/S1/products/abc.png',
        public_id: 'sellers/S1/products/abc',
        format: 'png',
        bytes: 68,
      }),
    };
  };
  const r = await uploadImageToCloudinary({ sellerId: 'S1', dataUri: PNG, mimeType: 'image/png' });
  assert.strictEqual(r.provider, 'CLOUDINARY');
  assert.ok(r.secure_url.startsWith('https://res.cloudinary.com/'));
  assert.strictEqual(r.public_id, 'sellers/S1/products/abc');
  assert.strictEqual(sentFolder, 'sellers/S1/products');
});

await test('2. Cloudinary upload failure throws (no silent local fallback)', async () => {
  setEnv({ cloud: true });
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid Signature' } }) });
  const before = fs.existsSync('uploads/products') ? fs.readdirSync('uploads/products').length : 0;
  await assert.rejects(
    () => uploadImageToCloudinary({ sellerId: 'S1', dataUri: PNG, mimeType: 'image/png' }),
    (e) => e.code === 'STORAGE_UPLOAD_FAILED' && e.status === 502 && /Invalid Signature/.test(e.message)
  );
  const after = fs.existsSync('uploads/products') ? fs.readdirSync('uploads/products').length : 0;
  assert.strictEqual(after, before, 'No local file must be written on Cloudinary failure');
});

await test('3. Cloudinary network error throws STORAGE_UPLOAD_FAILED', async () => {
  setEnv({ cloud: true });
  globalThis.fetch = async () => {
    throw new Error('ECONNRESET');
  };
  await assert.rejects(
    () => uploadImageToCloudinary({ sellerId: 'S1', dataUri: PNG }),
    (e) => e.code === 'STORAGE_UPLOAD_FAILED'
  );
});

await test('4. Local development upload works (mode=local, /uploads path)', async () => {
  setEnv({ prod: false, cloud: false });
  assert.strictEqual(getStorageMode(), 'local');
  const r = await uploadImageToCloudinary({ sellerId: 'DEV1', dataUri: PNG, mimeType: 'image/png', fileName: 'dev.png' });
  assert.strictEqual(r.provider, 'LOCAL_DEV');
  assert.ok(r.secure_url.startsWith('/uploads/products/'));
  assert.ok(r.public_id.startsWith('sellers/DEV1/'));
});

await test('5. Production without Cloudinary rejects upload (503 STORAGE_NOT_CONFIGURED)', async () => {
  setEnv({ prod: true, cloud: false });
  assert.strictEqual(getStorageMode(), 'unavailable');
  await assert.rejects(
    () => uploadImageToCloudinary({ sellerId: 'P1', dataUri: PNG }),
    (e) => e.code === 'STORAGE_NOT_CONFIGURED' && e.status === 503
  );
});

await test('6. Production with explicit persistent disk opt-in allows local mode', async () => {
  setEnv({ prod: true, cloud: false, persistent: true });
  assert.strictEqual(getStorageMode(), 'local');
});

await test('7. Production product save rejects localhost / relative / http URLs', async () => {
  setEnv({ prod: true, cloud: true });
  for (const bad of ['/uploads/products/a.jpg', 'http://localhost:5000/uploads/a.jpg', 'http://cdn.example.com/a.jpg', 'uploads/a.jpg']) {
    assert.throws(() => sanitizeProductImages([bad]), (e) => e.code === 'INVALID_IMAGE_URL', bad);
  }
  assert.deepStrictEqual(
    sanitizeProductImages(['https://res.cloudinary.com/x/image/upload/a.jpg']),
    ['https://res.cloudinary.com/x/image/upload/a.jpg']
  );
});

await test('8. Development product save accepts /uploads paths and HTTPS URLs', async () => {
  setEnv({ prod: false });
  const r = sanitizeProductImages(['/uploads/products/a.jpg', 'https://res.cloudinary.com/x/a.jpg']);
  assert.strictEqual(r.length, 2);
});

await test('9. Existing image preservation: order kept, duplicates/empties removed, undefined untouched', async () => {
  setEnv({ prod: false });
  const input = ['https://a.com/1.jpg', ' https://a.com/2.jpg ', '', 'https://a.com/1.jpg', { secure_url: 'https://a.com/3.jpg' }];
  assert.deepStrictEqual(sanitizeProductImages(input), ['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg']);
  assert.strictEqual(sanitizeProductImages(undefined), undefined, 'Edits without images must not touch stored images');
});

await test('10. Tenant isolation: distinct sellers -> distinct folders', async () => {
  setEnv({ cloud: true });
  const folders = [];
  globalThis.fetch = async (u, opts) => {
    const f = opts.body.get('folder');
    folders.push(f);
    return { ok: true, status: 200, json: async () => ({ secure_url: `https://res.cloudinary.com/t/${f}/x.png`, public_id: `${f}/x` }) };
  };
  const a = await uploadImageToCloudinary({ sellerId: 'SELLER_A', dataUri: PNG });
  const b = await uploadImageToCloudinary({ sellerId: 'SELLER_B', dataUri: PNG });
  assert.deepStrictEqual(folders, ['sellers/SELLER_A/products', 'sellers/SELLER_B/products']);
  assert.ok(a.public_id.startsWith('sellers/SELLER_A/') && b.public_id.startsWith('sellers/SELLER_B/'));
});

await test('11. Missing sellerId is rejected', async () => {
  setEnv({ prod: false });
  await assert.rejects(() => uploadImageToCloudinary({ dataUri: PNG }), /sellerId/);
});

await test('12. URL helpers classify correctly', async () => {
  assert.ok(isPublicHttpsUrl('https://res.cloudinary.com/a.jpg'));
  assert.ok(!isPublicHttpsUrl('https://localhost/a.jpg'));
  assert.ok(!isPublicHttpsUrl('http://res.cloudinary.com/a.jpg'));
  assert.ok(isLocalOrRelativeUrl('/uploads/a.jpg'));
  assert.ok(isLocalOrRelativeUrl('http://127.0.0.1:5000/a.jpg'));
});

if (process.env.RUN_LIVE_CLOUDINARY === '1') {
  await test('13. LIVE: real Cloudinary upload + public HTTPS accessibility', async () => {
    process.env.NODE_ENV = 'production';
    const r = await uploadImageToCloudinary({ sellerId: 'live_test_seller', dataUri: PNG, mimeType: 'image/png' });
    assert.strictEqual(r.provider, 'CLOUDINARY');
    assert.ok(isPublicHttpsUrl(r.secure_url));
    const res = await realFetch(r.secure_url);
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').startsWith('image/'));
    console.log(`    live secure_url: ${r.secure_url}`);
  });
} else {
  console.log('  - SKIP: 13. LIVE Cloudinary test (set RUN_LIVE_CLOUDINARY=1)');
}

console.log(`\nRESULTS: ${passed} PASSED | ${failed} FAILED\n`);
process.exit(failed > 0 ? 1 : 0);
