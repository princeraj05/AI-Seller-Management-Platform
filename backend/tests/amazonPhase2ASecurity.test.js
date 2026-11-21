import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'http';
import mongoose from 'mongoose';

import {
  computeLwaCacheKey,
  handleAmazonAuth,
  clearLwaTokenCache,
  evictLwaTokenCache,
} from '../src/integrations/marketplaces/amazon/amazon.auth.js';
import { AmazonSpApiClient } from '../src/integrations/marketplaces/amazon/amazon.client.js';
import {
  validateEncryptionConfig,
  getEncryptionKey,
  getOAuthHmacKey,
  encryptCredentials,
  decryptCredentials,
  generateOAuthState,
  verifyOAuthStateDurable,
  clearConsumedOAuthStates,
} from '../src/utils/encryption.js';
import { isOriginAllowed } from '../src/middleware/csrfMiddleware.js';
import { createRateLimiter } from '../src/middleware/rateLimitMiddleware.js';
import { ensureDefaultSeller } from '../src/config/db.js';
import { generateRefreshToken } from '../src/utils/token.js';
import { RefreshToken } from '../src/modules/users/refreshToken.model.js';
import { User } from '../src/modules/users/user.model.js';
import { PasswordResetToken } from '../src/modules/users/passwordResetToken.model.js';
import { resetPassword, loginWithGoogle } from '../src/modules/users/user.controller.js';
import { authMiddleware } from '../src/middleware/authMiddleware.js';
import { adminAuth } from '../src/config/firebase.js';
import { Return } from '../src/modules/returns/return.model.js';
import {
  inMemoryChannelsMap,
  inMemoryListingsMap,
  disconnectAmazonService,
  testAmazonConnectionService,
  publishProductToChannelService,
  getAmazonConnectionStatusService,
} from '../src/modules/channels/channel.service.js';
import { inMemoryProductsMap } from '../src/modules/products/product.service.js';
import { inMemorySubmissionsMap } from '../src/modules/channels/marketplaceListingSubmission.model.js';
import { executeListingSubmission } from '../src/integrations/marketplaces/amazon/amazon.publisher.service.js';
import { getAmazonListingBySku } from '../src/modules/channels/channel.controller.js';
import { acquireDistributedLock, inMemoryLocksMap } from '../src/modules/channels/distributedLock.service.js';

mongoose.set('bufferCommands', false);

const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    cookiesCleared: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    clearCookie(name) {
      this.cookiesCleared.push(name);
      return this;
    },
  };
  return res;
};

// =========================================================================
// 1. AMAZON LWA TOKEN CACHE & TENANT ISOLATION
// =========================================================================
test('1.1 Two tenants with refresh tokens sharing the exact same prefix never collide in LWA cache', async () => {
  clearLwaTokenCache();
  const sharedPrefix = 'Atzr|IwEBIA_SAME_PREFIX_1234567890_';
  const tokenA = `${sharedPrefix}TENANT_A_SECRET_SUFFIX`;
  const tokenB = `${sharedPrefix}TENANT_B_SECRET_SUFFIX`;
  const clientId = 'amzn1.application-oa2-client.test-client';
  const clientSecret = 'test-secret-value';

  assert.notEqual(
    computeLwaCacheKey(clientId, tokenA, 'seller-A'),
    computeLwaCacheKey(clientId, tokenB, 'seller-B')
  );
  assert.notEqual(
    computeLwaCacheKey(clientId, tokenA),
    computeLwaCacheKey(clientId, tokenB),
    'Even without tenant scope, full SHA-256 key must differ for shared prefix tokens'
  );

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async (_url, opts) => {
    fetchCalls++;
    const body = new URLSearchParams(opts.body);
    const rt = body.get('refresh_token');
    const issuedToken = rt === tokenA ? 'Atza|ACCESS_TOKEN_FOR_TENANT_A' : 'Atza|ACCESS_TOKEN_FOR_TENANT_B';
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: issuedToken, token_type: 'bearer', expires_in: 3600 }),
    };
  };

  try {
    const authA = await handleAmazonAuth({ sellerId: 'seller-A', clientId, clientSecret, refreshToken: tokenA });
    const authB = await handleAmazonAuth({ sellerId: 'seller-B', clientId, clientSecret, refreshToken: tokenB });
    const authACached = await handleAmazonAuth({ sellerId: 'seller-A', clientId, clientSecret, refreshToken: tokenA });

    assert.equal(authA.authenticated, true);
    assert.equal(authB.authenticated, true);
    assert.equal(authA.accessToken, 'Atza|ACCESS_TOKEN_FOR_TENANT_A');
    assert.equal(authB.accessToken, 'Atza|ACCESS_TOKEN_FOR_TENANT_B');
    assert.notEqual(authA.accessToken, authB.accessToken);
    assert.equal(authACached.isCached, true);
    assert.equal(authACached.accessToken, 'Atza|ACCESS_TOKEN_FOR_TENANT_A');
    assert.equal(fetchCalls, 2);

    // Safe per-tenant eviction removes ONLY seller-A, leaving seller-B cached
    evictLwaTokenCache({ sellerId: 'seller-A', clientId, refreshToken: tokenA });
    const authBCached = await handleAmazonAuth({ sellerId: 'seller-B', clientId, clientSecret, refreshToken: tokenB });
    assert.equal(authBCached.isCached, true);
    assert.equal(authBCached.accessToken, 'Atza|ACCESS_TOKEN_FOR_TENANT_B');
    assert.equal(fetchCalls, 2);

    const authARefetched = await handleAmazonAuth({ sellerId: 'seller-A', clientId, clientSecret, refreshToken: tokenA });
    assert.equal(authARefetched.isCached, false);
    assert.equal(fetchCalls, 3);
  } finally {
    global.fetch = originalFetch;
    clearLwaTokenCache();
  }
});

test('1.2 Disconnected tenant cannot reuse global AMAZON_SP_API_REFRESH_TOKEN fallback', async () => {
  clearLwaTokenCache();
  inMemoryChannelsMap.clear();
  const prevGlobalRefresh = process.env.AMAZON_SP_API_REFRESH_TOKEN;
  process.env.AMAZON_SP_API_REFRESH_TOKEN = 'Atzr|GLOBAL_FALLBACK_MUST_NEVER_BE_USED';

  try {
    // Direct handleAmazonAuth without tenant refreshToken must NOT fall back to env
    const authRes = await handleAmazonAuth({ sellerId: 'seller-no-token' });
    assert.equal(authRes.authenticated, false);
    assert.equal(authRes.code, 'SELLER_AUTH_REQUIRED');

    // AmazonSpApiClient without explicit refreshToken must NOT pick up global env token
    const client = new AmazonSpApiClient({ sellerId: 'seller-no-token', region: 'eu', sandbox: true });
    assert.equal(client.credentials.refreshToken, '');
    const testRes = await client.testConnection();
    assert.equal(testRes.authenticated, false);
    assert.equal(testRes.requiresSellerAuth, true);

    // Seed a connected tenant, cache its token, then disconnect -> must evict cache and fail testConnection
    const tenantToken = 'Atzr|TENANT_DISCONNECT_TEST_TOKEN_999';
    inMemoryChannelsMap.set('chan-disc-1', {
      _id: 'chan-disc-1',
      id: 'chan-disc-1',
      sellerId: 'seller-disc-1',
      provider: 'AMAZON',
      channel: 'amazon',
      status: 'CONNECTED',
      credentials: encryptCredentials({ refreshToken: tenantToken }),
    });

    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'Atza|TEMP_TOKEN', token_type: 'bearer', expires_in: 3600 }),
    });
    try {
      await handleAmazonAuth({ sellerId: 'seller-disc-1', refreshToken: tenantToken });
    } finally {
      global.fetch = originalFetch;
    }

    await disconnectAmazonService('seller-disc-1');
    const afterDisconnect = await testAmazonConnectionService('seller-disc-1');
    assert.equal(afterDisconnect.authenticated, false);
    assert.equal(afterDisconnect.code, 'NOT_CONNECTED');
  } finally {
    if (prevGlobalRefresh === undefined) delete process.env.AMAZON_SP_API_REFRESH_TOKEN;
    else process.env.AMAZON_SP_API_REFRESH_TOKEN = prevGlobalRefresh;
    inMemoryChannelsMap.clear();
    clearLwaTokenCache();
  }
});

// =========================================================================
// 2. AUTHENTICATION SECURITY
// =========================================================================
test('2.1 Unauthorized POST /api/auth/reset-password is rejected for Google OAuth and legacy accounts', async () => {
  const origUserFindOne = User.findOne;
  const origResetFindOneAndUpdate = PasswordResetToken.findOneAndUpdate;
  const origResetUpdateMany = PasswordResetToken.updateMany;
  const origRefreshUpdateMany = RefreshToken.updateMany;

  let savedPassword = null;
  const makeMockUser = (overrides) => ({
    _id: new mongoose.Types.ObjectId(),
    email: 'victim@example.com',
    isActive: true,
    tokenVersion: 0,
    password: null,
    firebaseUid: 'fb-uid-victim',
    async save() {
      savedPassword = this.password;
      return this;
    },
    async comparePassword() {
      return false;
    },
    ...overrides,
  });

  try {
    // Case A: Google OAuth user (no password) — unauthenticated takeover attempt MUST fail with 401
    const googleUser = makeMockUser({ password: null });
    User.findOne = () => ({ select: async () => googleUser });

    const resGoogle = createMockRes();
    await resetPassword(
      { body: { email: 'victim@example.com', newPassword: 'AttackerPassword123!' }, headers: {} },
      resGoogle
    );
    assert.equal(resGoogle.statusCode, 401);
    assert.equal(resGoogle.body.code, 'RESET_AUTH_REQUIRED');
    assert.equal(savedPassword, null);

    // Case B: Legacy plaintext user without currentPassword — MUST fail with 401
    const legacyUser = makeMockUser({ password: 'old-plaintext-password' });
    User.findOne = () => ({ select: async () => legacyUser });

    const resLegacy = createMockRes();
    await resetPassword(
      { body: { email: 'victim@example.com', newPassword: 'AttackerPassword123!' }, headers: {} },
      resLegacy
    );
    assert.equal(resLegacy.statusCode, 401);
    assert.equal(resLegacy.body.code, 'CURRENT_PASSWORD_REQUIRED');
    assert.equal(savedPassword, null);

    // Case C: Legitimate Google OAuth recovery WITH verified single-use resetToken — MUST succeed
    User.findOne = () => ({ select: async () => googleUser });
    let tokenConsumed = false;
    PasswordResetToken.findOneAndUpdate = async () => {
      if (tokenConsumed) return null;
      tokenConsumed = true;
      return { _id: 'tok-1', userId: googleUser._id, isUsed: true };
    };
    PasswordResetToken.updateMany = async () => ({ modifiedCount: 0 });
    RefreshToken.updateMany = async () => ({ modifiedCount: 0 });

    const resLegit = createMockRes();
    await resetPassword(
      {
        body: {
          email: 'victim@example.com',
          newPassword: 'RecoveredPassword123!',
          resetToken: 'valid-single-use-reset-token',
        },
        headers: {},
      },
      resLegit
    );
    assert.equal(resLegit.statusCode, 200);
    assert.equal(resLegit.body.success, true);
    assert.equal(savedPassword, 'RecoveredPassword123!');

    // Case D: Replay of same resetToken MUST fail with 401
    const resReplay = createMockRes();
    await resetPassword(
      {
        body: {
          email: 'victim@example.com',
          newPassword: 'AnotherPassword123!',
          resetToken: 'valid-single-use-reset-token',
        },
        headers: {},
      },
      resReplay
    );
    assert.equal(resReplay.statusCode, 401);
    assert.equal(resReplay.body.code, 'INVALID_RESET_TOKEN');
  } finally {
    User.findOne = origUserFindOne;
    PasswordResetToken.findOneAndUpdate = origResetFindOneAndUpdate;
    PasswordResetToken.updateMany = origResetUpdateMany;
    RefreshToken.updateMany = origRefreshUpdateMany;
  }
});

test('2.2 Default demo seller is never seeded in production', async () => {
  const origFindOne = User.findOne;
  const origCreate = User.create;
  let dbTouched = false;
  User.findOne = async () => {
    dbTouched = true;
    return null;
  };
  User.create = async () => {
    dbTouched = true;
    return {};
  };

  try {
    const prodRes = await ensureDefaultSeller({ NODE_ENV: 'production' });
    assert.equal(prodRes.seeded, false);
    assert.equal(prodRes.skipped, true);
    assert.equal(dbTouched, false, 'Must not query or seed demo user in production');

    const testRes = await ensureDefaultSeller({ NODE_ENV: 'test' });
    assert.equal(testRes.seeded, false);
    assert.equal(testRes.skipped, true);
    assert.equal(dbTouched, false);
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

test('2.3 Refresh token DB persistence error is propagated instead of silently swallowed', async () => {
  const origCreate = RefreshToken.create;
  RefreshToken.create = async () => {
    throw new Error('MongoNetworkError: write failed');
  };

  try {
    await assert.rejects(
      () => generateRefreshToken({ _id: new mongoose.Types.ObjectId(), tokenVersion: 0 }),
      (err) => err.code === 'REFRESH_TOKEN_PERSISTENCE_FAILED' && err.status === 503
    );
  } finally {
    RefreshToken.create = origCreate;
  }
});

test('2.4 Firebase unverified email cannot link to or auto-provision an account', async () => {
  if (!adminAuth) {
    return;
  }
  const origVerify = adminAuth.verifyIdToken;
  const origUserFindOne = User.findOne;
  const origReadyStateDesc = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

  adminAuth.verifyIdToken = async () => ({
    uid: 'fb-unverified-uid-999',
    email: 'existing-seller@example.com',
    name: 'Unverified Attacker',
    email_verified: false,
  });
  User.findOne = async (query) => {
    if (query.firebaseUid) return null; // Not already linked by UID
    return { _id: new mongoose.Types.ObjectId(), email: 'existing-seller@example.com' };
  };

  try {
    // authMiddleware must reject with 403 EMAIL_NOT_VERIFIED
    const mwRes = createMockRes();
    let nextCalled = false;
    await authMiddleware(
      { headers: { authorization: 'Bearer mock-unverified-firebase-token' } },
      mwRes,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(mwRes.statusCode, 403);
    assert.equal(mwRes.body.code, 'EMAIL_NOT_VERIFIED');

    // loginWithGoogle must reject with 403 EMAIL_NOT_VERIFIED when DB is ready
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    const googleRes = createMockRes();
    await loginWithGoogle({ body: { idToken: 'mock-unverified-firebase-token' } }, googleRes);
    assert.equal(googleRes.statusCode, 403);
    assert.equal(googleRes.body.code, 'EMAIL_NOT_VERIFIED');
  } finally {
    adminAuth.verifyIdToken = origVerify;
    User.findOne = origUserFindOne;
    if (origReadyStateDesc) {
      Object.defineProperty(mongoose.connection, 'readyState', origReadyStateDesc);
    } else {
      delete mongoose.connection.readyState;
    }
  }
});

// =========================================================================
// 3. CORS & HTTP SECURITY
// =========================================================================
test('3.1 CORS rejects arbitrary *.vercel.app origins and allows only explicit ALLOWED_ORIGINS', () => {
  const prodEnv = {
    NODE_ENV: 'production',
    CLIENT_URL: 'https://seller.bhartiyecrafts.com',
    ALLOWED_ORIGINS: 'https://admin.bhartiyecrafts.com,https://app.bhartiyecrafts.com/',
  };

  assert.equal(isOriginAllowed('https://seller.bhartiyecrafts.com', prodEnv), true);
  assert.equal(isOriginAllowed('https://admin.bhartiyecrafts.com', prodEnv), true);
  assert.equal(isOriginAllowed('https://app.bhartiyecrafts.com', prodEnv), true);

  // Arbitrary Vercel subdomains MUST be rejected in both production and development
  assert.equal(isOriginAllowed('https://evil-attacker.vercel.app', prodEnv), false);
  assert.equal(isOriginAllowed('https://ai-seller-management-platform.vercel.app', prodEnv), false);
  assert.equal(
    isOriginAllowed('https://evil-attacker.vercel.app', { NODE_ENV: 'development', CLIENT_URL: 'http://localhost:3000' }),
    false
  );
  assert.equal(
    isOriginAllowed('http://localhost:3000', { NODE_ENV: 'development', CLIENT_URL: 'http://localhost:3000' }),
    true
  );
  assert.equal(isOriginAllowed('http://localhost:3000', prodEnv), false);
});

test('3.2 Express app enforces Helmet headers, disables X-Powered-By, trusts proxy, and enforces rate limiting', async () => {
  const { default: app } = await import('../src/app.js');
  assert.equal(app.get('trust proxy'), 1);
  assert.equal(app.get('x-powered-by'), false);

  const invokeExpress = (expressApp, { method = 'GET', url = '/api/health', headers = {}, ip = '127.0.0.1' } = {}) =>
    new Promise((resolve, reject) => {
      const req = Object.create(http.IncomingMessage.prototype);
      req.method = method;
      req.url = url;
      req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      req.socket = { remoteAddress: ip };
      req.connection = req.socket;

      const resHeaders = {};
      const chunks = [];
      const res = Object.create(http.ServerResponse.prototype);
      res.statusCode = 200;
      res.locals = {};
      res.setHeader = (k, v) => {
        resHeaders[String(k).toLowerCase()] = v;
        return res;
      };
      res.getHeader = (k) => resHeaders[String(k).toLowerCase()];
      res.getHeaders = () => ({ ...resHeaders });
      res.removeHeader = (k) => {
        delete resHeaders[String(k).toLowerCase()];
      };
      res.hasHeader = (k) => Object.prototype.hasOwnProperty.call(resHeaders, String(k).toLowerCase());
      res.writeHead = (code, hdrs) => {
        res.statusCode = code;
        if (hdrs) {
          for (const [k, v] of Object.entries(hdrs)) res.setHeader(k, v);
        }
        return res;
      };
      res.write = (chunk) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      };
      res.end = (chunk) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const rawBody = Buffer.concat(chunks).toString('utf8');
        let jsonBody = null;
        try {
          jsonBody = JSON.parse(rawBody);
        } catch {
          // non-JSON
        }
        resolve({ status: res.statusCode, headers: resHeaders, body: jsonBody, rawBody });
        return res;
      };

      expressApp(req, res, (err) => {
        if (err) reject(err);
      });
    });

  // 1. Verify Helmet security headers & X-Powered-By removal on /api/health
  const healthRes = await invokeExpress(app, { method: 'GET', url: '/api/health' });
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.headers['x-powered-by'], undefined);
  assert.equal(healthRes.headers['x-content-type-options'], 'nosniff');
  assert.ok(healthRes.headers['content-security-policy']);
  assert.equal(healthRes.headers['referrer-policy'], 'strict-origin-when-cross-origin');

  // 2. Verify arbitrary Vercel origin is rejected by CORS with 403 and no ACAO header
  const corsRes = await invokeExpress(app, {
    method: 'GET',
    url: '/api/health',
    headers: { Origin: 'https://evil-phishing.vercel.app' },
  });
  assert.equal(corsRes.status, 403);
  assert.equal(corsRes.headers['access-control-allow-origin'], undefined);

  // 3. Verify express-rate-limit middleware returns 429 RATE_LIMIT_EXCEEDED after max hits
  const express = (await import('express')).default;
  const rateApp = express();
  rateApp.use('/limited', createRateLimiter({ windowMs: 60000, max: 2 }), (_req, r) => r.status(200).json({ ok: true }));

  const r1 = await invokeExpress(rateApp, { url: '/limited', ip: '10.0.0.1' });
  const r2 = await invokeExpress(rateApp, { url: '/limited', ip: '10.0.0.1' });
  const r3 = await invokeExpress(rateApp, { url: '/limited', ip: '10.0.0.1' });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 429);
  assert.equal(r3.body?.code, 'RATE_LIMIT_EXCEEDED');
});

// =========================================================================
// 4. TENANT ISOLATION & PRODUCTION MEMORY-FALLBACK BLOCKING
// =========================================================================
test('4.1 Cross-tenant submission, listing, and product access in memory maps are rejected', async () => {
  inMemorySubmissionsMap.clear();
  inMemoryListingsMap.clear();
  inMemoryProductsMap.clear();
  inMemoryChannelsMap.clear();

  try {
    // 1. Cross-tenant submission via inMemorySubmissionsMap
    inMemorySubmissionsMap.set('sub-tenant-a', {
      _id: 'sub-tenant-a',
      sellerId: 'seller-A',
      storeId: 'store-A',
      productId: 'prod-A',
      sellerSku: 'SKU-A',
      productType: 'SHIRT',
    });

    await assert.rejects(
      () =>
        executeListingSubmission({
          tenant: { sellerId: 'seller-B', storeId: 'store-B' },
          submissionId: 'sub-tenant-a',
          dryRun: true,
        }),
      (err) => err.code === 'UNAUTHORIZED_ACCESS' && err.status === 403
    );

    // 2. Cross-tenant listing via inMemoryListingsMap (scoped key + old unscoped key)
    inMemoryListingsMap.set('seller-A:SHARED-SKU', {
      _id: 'seller-A:SHARED-SKU',
      sellerId: 'seller-A',
      storeId: null,
      provider: 'AMAZON',
      externalSku: 'SHARED-SKU',
      title: 'Tenant A Confidential Listing',
    });
    inMemoryListingsMap.set('list-SHARED-SKU', {
      _id: 'list-SHARED-SKU',
      sellerId: 'seller-A',
      storeId: null,
      provider: 'AMAZON',
      externalSku: 'SHARED-SKU',
      title: 'Legacy Unscoped Tenant A Listing',
    });

    const resB = createMockRes();
    await getAmazonListingBySku(
      { tenant: { sellerId: 'seller-B', storeId: null }, params: { sku: 'SHARED-SKU' }, query: {} },
      resB
    );
    assert.equal(resB.statusCode, 404, 'Seller B must not read Seller A listing from inMemoryListingsMap');

    // 3. Cross-tenant product access in publishProductToChannelService
    inMemoryProductsMap.set('prod-a-1', {
      _id: 'prod-a-1',
      sellerId: 'seller-A',
      storeId: 'store-A',
      sku: 'SKU-PROD-A',
    });
    await assert.rejects(
      () => publishProductToChannelService({ sellerId: 'seller-B', storeId: 'store-B' }, 'prod-a-1', 'chan-b'),
      (err) => err.code === 'UNAUTHORIZED_ACCESS' && err.status === 403
    );
  } finally {
    inMemorySubmissionsMap.clear();
    inMemoryListingsMap.clear();
    inMemoryProductsMap.clear();
    inMemoryChannelsMap.clear();
  }
});

test('4.2 Process-local memory fallbacks are blocked in NODE_ENV=production', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  inMemoryChannelsMap.set('prod-test-chan', {
    _id: 'prod-test-chan',
    sellerId: 'seller-prod',
    provider: 'AMAZON',
    channel: 'amazon',
    status: 'CONNECTED',
  });
  inMemoryLocksMap.clear();

  try {
    await assert.rejects(
      () => getAmazonConnectionStatusService('seller-prod'),
      (err) => err.code === 'SERVICE_UNAVAILABLE' && err.status === 503
    );

    await assert.rejects(
      () => acquireDistributedLock({ sellerId: 'seller-prod', channelId: 'chan-1' }),
      (err) => err.code === 'LOCK_SERVICE_UNAVAILABLE' && err.status === 503
    );
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    inMemoryChannelsMap.clear();
    inMemoryLocksMap.clear();
  }
});

test('4.3 Return model removes global rmaNumber uniqueness and enforces tenant-scoped compound uniqueness', () => {
  const rmaPath = Return.schema.path('rmaNumber');
  assert.notEqual(rmaPath.options.unique, true, 'rmaNumber must NOT have global unique: true');

  const indexes = Return.schema.indexes();
  const hasTenantRmaUnique = indexes.some(
    ([fields, opts]) => fields.sellerId === 1 && fields.rmaNumber === 1 && opts?.unique === true
  );
  assert.equal(hasTenantRmaUnique, true, 'Return schema must enforce unique { sellerId: 1, rmaNumber: 1 }');
});

// =========================================================================
// 5. ENCRYPTION (12-BYTE IV + BACKWARD COMPAT) & DURABLE OAUTH STATE
// =========================================================================
test('5.1 Encryption uses standard 12-byte GCM IV while remaining backward-compatible with legacy 16-byte IV credentials', () => {
  const secretPayload = { refreshToken: 'Atzr|test-token-123', sellingPartnerId: 'A2TESTPARTNER' };
  const encrypted = encryptCredentials(secretPayload);

  assert.equal(Buffer.from(encrypted.iv, 'hex').length, 12, 'New encryptions must use standard 12-byte (96-bit) IV');
  assert.deepEqual(decryptCredentials(encrypted), secretPayload);

  // Simulate an existing stored credential encrypted previously with a legacy 16-byte IV
  const legacyIv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, legacyIv);
  let legacyContent = cipher.update(JSON.stringify(secretPayload), 'utf8', 'hex');
  legacyContent += cipher.final('hex');
  const legacyTag = cipher.getAuthTag().toString('hex');

  const decryptedLegacy = decryptCredentials({
    iv: legacyIv.toString('hex'),
    content: legacyContent,
    tag: legacyTag,
  });
  assert.deepEqual(decryptedLegacy, secretPayload, 'Existing 16-byte IV stored credentials must remain decryptable');

  // HKDF domain separation: OAuth HMAC key must differ from AES encryption key
  assert.notEqual(
    getOAuthHmacKey().toString('hex'),
    getEncryptionKey().toString('hex'),
    'OAuth HMAC key must be domain-separated from AES credential encryption key via HKDF'
  );

  // Startup encryption config validation rejects missing/short/placeholder/JWT-reused keys in production
  assert.throws(
    () => validateEncryptionConfig({ NODE_ENV: 'production', INTEGRATION_ENCRYPTION_KEY: 'short' }),
    /CRITICAL SECURITY ERROR/
  );
  assert.throws(
    () =>
      validateEncryptionConfig({
        NODE_ENV: 'production',
        INTEGRATION_ENCRYPTION_KEY: 'your_32_byte_secret_key_here_1234567890',
        JWT_ACCESS_SECRET: 'your_32_byte_secret_key_here_1234567890',
      }),
    /must not reuse JWT secrets/
  );
  assert.throws(
    () =>
      validateEncryptionConfig({
        NODE_ENV: 'production',
        INTEGRATION_ENCRYPTION_KEY: 'antigravity_default_secret_key_32bytes_len!!',
      }),
    /placeholder or default dev secret/
  );
});

test('5.2 Durable OAuth state blocks cross-instance replay, fails closed on DB error, validates provider & structure', async () => {
  clearConsumedOAuthStates();
  const dbNonces = new Set();

  // Simulated shared MongoDB unique index across 2 independent server instances
  const mockNonceModel = {
    async create(doc) {
      if (dbNonces.has(doc.nonce)) {
        const dupErr = new Error('E11000 duplicate key error');
        dupErr.code = 11000;
        throw dupErr;
      }
      dbNonces.add(doc.nonce);
      return doc;
    },
  };

  const state = generateOAuthState('seller-oauth-1', 'AMAZON', 900000);

  // Instance 1 consumes state successfully
  const first = await verifyOAuthStateDurable(state, 'seller-oauth-1', {
    expectedProvider: 'AMAZON',
    nonceModel: mockNonceModel,
  });
  assert.equal(first.valid, true);
  assert.equal(first.tenantId, 'seller-oauth-1');

  // Simulate Instance 2 (empty local memory map) attempting replay of the SAME state token
  clearConsumedOAuthStates();
  const replay = await verifyOAuthStateDurable(state, 'seller-oauth-1', {
    expectedProvider: 'AMAZON',
    nonceModel: mockNonceModel,
  });
  assert.equal(replay.valid, false);
  assert.equal(replay.code, 'OAUTH_STATE_REPLAY');

  // Provider mismatch rejected
  const wrongProviderState = generateOAuthState('seller-oauth-1', 'FLIPKART', 900000);
  const providerCheck = await verifyOAuthStateDurable(wrongProviderState, 'seller-oauth-1', {
    expectedProvider: 'AMAZON',
    nonceModel: mockNonceModel,
  });
  assert.equal(providerCheck.valid, false);
  assert.match(providerCheck.error, /provider mismatch/i);

  // Malformed multi-dot structure rejected
  const malformedCheck = await verifyOAuthStateDurable(`${state}.extra`, 'seller-oauth-1', {
    expectedProvider: 'AMAZON',
    nonceModel: mockNonceModel,
  });
  assert.equal(malformedCheck.valid, false);

  // Fail-closed when DB nonce store errors
  const freshState = generateOAuthState('seller-oauth-2', 'AMAZON', 900000);
  const failingNonceModel = {
    async create() {
      throw new Error('MongoServerSelectionError: connection lost');
    },
  };
  const dbDownResult = await verifyOAuthStateDurable(freshState, 'seller-oauth-2', {
    expectedProvider: 'AMAZON',
    nonceModel: failingNonceModel,
  });
  assert.equal(dbDownResult.valid, false);
  assert.equal(dbDownResult.code, 'OAUTH_STATE_STORE_UNAVAILABLE');
});
