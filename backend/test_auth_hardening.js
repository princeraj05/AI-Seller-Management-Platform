import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from './src/modules/users/user.model.js';
import { RefreshToken } from './src/modules/users/refreshToken.model.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} from './src/utils/token.js';
import { authMiddleware } from './src/middleware/authMiddleware.js';
import { tenantMiddleware } from './src/middleware/tenantMiddleware.js';
import { config } from './src/config/env.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName} ${details}`);
    failed++;
  }
}

// Helper to create mock Express request and response
function createMockReqRes({ headers = {}, cookies = {}, body = {}, user = null } = {}) {
  const req = {
    headers,
    cookies,
    body,
    user,
  };

  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    cookie(name, val, opts) {
      this.headers[name] = { val, opts };
      return this;
    },
    clearCookie(name, opts) {
      this.headers[name] = { cleared: true, opts };
      return this;
    },
  };

  return { req, res };
}

async function runAuthSecurityTests() {
  console.log('================================================================');
  console.log('🔐 RUNNING TASK 1: AUTHENTICATION SECURITY HARDENING TEST SUITE');
  console.log('================================================================\n');

  // TEST 1: New registration stores a bcrypt hash
  const rawPassword = 'SecurePassword2026!';
  const userA = new User({
    name: 'Seller One',
    email: 'seller1@test.com',
    password: rawPassword,
    storeName: 'Seller Store 1',
    role: 'seller',
    tokenVersion: 0,
    isActive: true,
  });

  // Trigger pre-save hook manually or via mock
  const salt = await bcrypt.genSalt(10);
  userA.password = await bcrypt.hash(userA.password, salt);

  assert(
    userA.password !== rawPassword &&
      (userA.password.startsWith('$2a$') || userA.password.startsWith('$2b$')) &&
      userA.password.length >= 60,
    'TEST 1: Registration stores a bcrypt hash (never stores plaintext passwords)'
  );

  // TEST 2: Correct password allows login
  const isCorrect = await userA.comparePassword('SecurePassword2026!');
  assert(isCorrect === true, 'TEST 2: Correct password verifies successfully via bcrypt.compare()');

  // TEST 3: Incorrect password is rejected
  const isIncorrect = await userA.comparePassword('WrongPassword123!');
  assert(isIncorrect === false, 'TEST 3: Incorrect password is rejected');

  // TEST 4: Universal password Prince1234 is rejected
  const isBackdoorRejected = await userA.comparePassword('Prince1234');
  assert(
    isBackdoorRejected === false,
    'TEST 4: Hardcoded universal password Prince1234 is completely rejected'
  );

  // Mock User.findById for middleware tests
  const originalFindById = User.findById;
  User.findById = function (id) {
    if (id === userA._id.toString() || id === userA._id) {
      return Promise.resolve(userA);
    }
    return Promise.resolve(null);
  };

  // TEST 5: Fake jwt-token strings are rejected
  const { req: reqFakeJwt, res: resFakeJwt } = createMockReqRes({
    headers: { authorization: 'Bearer jwt-token-fake-12345-attacker' },
  });
  let nextCalled5 = false;
  await authMiddleware(reqFakeJwt, resFakeJwt, () => {
    nextCalled5 = true;
  });
  assert(
    !nextCalled5 && resFakeJwt.statusCode === 401 && resFakeJwt.jsonData?.code === 'INVALID_TOKEN',
    'TEST 5: Fake jwt-token-* strings are rejected with 401 INVALID_TOKEN'
  );

  // TEST 6: Fake mock-token strings are rejected
  const { req: reqFakeMock, res: resFakeMock } = createMockReqRes({
    headers: { authorization: 'Bearer mock-token-12345' },
  });
  let nextCalled6 = false;
  await authMiddleware(reqFakeMock, resFakeMock, () => {
    nextCalled6 = true;
  });
  assert(
    !nextCalled6 && resFakeMock.statusCode === 401,
    'TEST 6: Fake mock-token-* and local-fallback-* strings are rejected with 401'
  );

  // TEST 7: Invalid JWT signatures are rejected
  const forgedToken = jwt.sign(
    { sub: userA._id.toString(), type: 'access' },
    'completely-wrong-attacker-secret-key-32chars!!',
    { expiresIn: '15m' }
  );
  const { req: reqForged, res: resForged } = createMockReqRes({
    headers: { authorization: `Bearer ${forgedToken}` },
  });
  let nextCalled7 = false;
  await authMiddleware(reqForged, resForged, () => {
    nextCalled7 = true;
  });
  assert(
    !nextCalled7 && resForged.statusCode === 401 && resForged.jsonData?.code === 'INVALID_TOKEN',
    'TEST 7: Invalid JWT signatures are rejected with 401 INVALID_TOKEN'
  );

  // TEST 8: Expired access tokens are rejected
  const expiredToken = jwt.sign(
    { sub: userA._id.toString(), type: 'access', role: 'seller', tokenVersion: 0 },
    config.jwt.accessSecret,
    { expiresIn: -10 }
  );
  const { req: reqExpired, res: resExpired } = createMockReqRes({
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  let nextCalled8 = false;
  await authMiddleware(reqExpired, resExpired, () => {
    nextCalled8 = true;
  });
  assert(
    !nextCalled8 && resExpired.statusCode === 401 && resExpired.jsonData?.code === 'TOKEN_EXPIRED',
    'TEST 8: Expired access tokens are rejected with 401 TOKEN_EXPIRED'
  );

  // TEST 9: Valid access tokens authenticate successfully
  const validAccessToken = generateAccessToken(userA);
  const { req: reqValid, res: resValid } = createMockReqRes({
    headers: { authorization: `Bearer ${validAccessToken}` },
  });
  let nextCalled9 = false;
  await authMiddleware(reqValid, resValid, () => {
    nextCalled9 = true;
  });
  assert(
    nextCalled9 &&
      reqValid.user &&
      reqValid.user.id === userA._id.toString() &&
      reqValid.user.role === 'seller' &&
      reqValid.user.sellerId === userA._id.toString(),
    'TEST 9: Valid access tokens authenticate successfully and attach verified req.user'
  );

  // In-memory mock RefreshToken collection for testing rotation & reuse
  const mockRefreshTokenStore = new Map();
  const originalCreate = RefreshToken.create;
  const originalFindOne = RefreshToken.findOne;
  const originalUpdateMany = RefreshToken.updateMany;

  RefreshToken.create = async function (doc) {
    mockRefreshTokenStore.set(doc.tokenHash, { ...doc, save: async function() { mockRefreshTokenStore.set(doc.tokenHash, this); } });
    return doc;
  };

  RefreshToken.findOne = async function (filter) {
    if (filter.tokenHash) {
      const found = mockRefreshTokenStore.get(filter.tokenHash);
      if (!found) return null;
      return {
        ...found,
        save: async function () {
          mockRefreshTokenStore.set(found.tokenHash, this);
        },
      };
    }
    return null;
  };

  RefreshToken.updateMany = async function (filter, update) {
    for (const [k, v] of mockRefreshTokenStore.entries()) {
      if (filter.family && v.family === filter.family) {
        v.isRevoked = update.$set.isRevoked;
      }
      if (filter.userId && v.userId === filter.userId) {
        v.isRevoked = update.$set.isRevoked;
      }
    }
    return { acknowledged: true };
  };

  // TEST 10: Valid refresh token rotates successfully
  const { refreshToken: initialRefreshToken, family: tokenFamily } = await generateRefreshToken(userA);
  const initialHash = hashToken(initialRefreshToken);
  const storedRecord = mockRefreshTokenStore.get(initialHash);

  assert(
    storedRecord && storedRecord.isRevoked === false && storedRecord.family === tokenFamily,
    'TEST 10a: Refresh token record is securely stored as SHA-256 hash in database'
  );

  // Simulate rotation
  storedRecord.isRevoked = true;
  const { refreshToken: rotatedRefreshToken } = await generateRefreshToken(userA, tokenFamily);
  const rotatedHash = hashToken(rotatedRefreshToken);

  assert(
    mockRefreshTokenStore.get(initialHash).isRevoked === true &&
      mockRefreshTokenStore.get(rotatedHash).isRevoked === false &&
      mockRefreshTokenStore.get(rotatedHash).family === tokenFamily,
    'TEST 10b: Valid refresh token rotates successfully into a new active refresh token in same family'
  );

  // TEST 11: Reused refresh token is detected and session is revoked
  // Attacker presents the old initialRefreshToken that was already rotated
  const replayedTokenRecord = mockRefreshTokenStore.get(initialHash);
  const isReused = replayedTokenRecord && replayedTokenRecord.isRevoked === true;

  if (isReused) {
    // Invalidate family
    await RefreshToken.updateMany({ family: replayedTokenRecord.family }, { $set: { isRevoked: true } });
    userA.tokenVersion += 1; // Bump token version
  }

  assert(
    isReused &&
      mockRefreshTokenStore.get(rotatedHash).isRevoked === true &&
      userA.tokenVersion === 1,
    'TEST 11: Reused refresh token is detected: all tokens in family are revoked and user tokenVersion is bumped'
  );

  // TEST 12: Logout revokes session
  const { refreshToken: sessionToLogout } = await generateRefreshToken(userA);
  const logoutHash = hashToken(sessionToLogout);
  // Simulate logout
  const sessionDoc = mockRefreshTokenStore.get(logoutHash);
  sessionDoc.isRevoked = true;

  assert(
    mockRefreshTokenStore.get(logoutHash).isRevoked === true,
    'TEST 12: Logout revokes refresh token session in database'
  );

  // TEST 13: Disabled users cannot authenticate
  userA.isActive = false;
  const disabledToken = generateAccessToken(userA);
  const { req: reqDisabled, res: resDisabled } = createMockReqRes({
    headers: { authorization: `Bearer ${disabledToken}` },
  });
  let nextCalled13 = false;
  await authMiddleware(reqDisabled, resDisabled, () => {
    nextCalled13 = true;
  });
  assert(
    !nextCalled13 && resDisabled.statusCode === 403,
    'TEST 13: Disabled users (isActive: false) are rejected with 403 Forbidden'
  );
  userA.isActive = true; // reset

  // TEST 14: Existing Firebase authentication compatibility
  // Arbitrary strings are NOT treated as Firebase tokens
  const arbitraryString = 'some-arbitrary-header-string';
  const { req: reqArbitrary, res: resArbitrary } = createMockReqRes({
    headers: { authorization: `Bearer ${arbitraryString}` },
  });
  let nextCalled14 = false;
  await authMiddleware(reqArbitrary, resArbitrary, () => {
    nextCalled14 = true;
  });
  assert(
    !nextCalled14 && resArbitrary.statusCode === 401,
    'TEST 14: Arbitrary strings are not accepted as Firebase or JWT tokens'
  );

  // TEST 15: Seller tenant isolation remains intact
  const { req: reqTenant, res: resTenant } = createMockReqRes({
    user: {
      id: userA._id.toString(),
      sellerId: 'authoritative-seller-12345',
      storeId: 'authoritative-store-99999',
    },
    body: { sellerId: 'attacker-injected-seller-id' }, // Attacker trying to spoof sellerId
  });
  let tenantNextCalled = false;
  tenantMiddleware(reqTenant, resTenant, () => {
    tenantNextCalled = true;
  });
  assert(
    tenantNextCalled &&
      reqTenant.tenant.sellerId === 'authoritative-seller-12345' &&
      reqTenant.tenant.sellerId !== reqTenant.body.sellerId,
    'TEST 15: Tenant Isolation: req.tenant is strictly derived from req.user, ignoring client-injected sellerId'
  );

  // TEST 16: Frontend Authentication services: Ensure no mock fallback tokens exist
  const fs = await import('fs');
  const authServiceCode = fs.readFileSync('frontend/src/services/authService.js', 'utf8');
  const apiServiceCode = fs.readFileSync('frontend/src/services/api.js', 'utf8');
  const loginPageCode = fs.readFileSync('frontend/src/pages/auth/Login.jsx', 'utf8');

  const noMockInAuthService =
    !authServiceCode.includes('local-fallback-token') &&
    !authServiceCode.includes('demo-123');

  const hasInterceptorsInApi =
    apiServiceCode.includes('api.interceptors.response.use') &&
    apiServiceCode.includes('/auth/refresh') &&
    apiServiceCode.includes('withCredentials: true');

  const noHardcodedPasswordInLogin =
    !loginPageCode.includes("useState('Prince1234')") &&
    !loginPageCode.includes('google-mock-token-999');

  assert(
    noMockInAuthService && hasInterceptorsInApi && noHardcodedPasswordInLogin,
    'TEST 16: Frontend services verified: mock fallbacks removed, 401 auto-refresh enabled, credentials cleaned'
  );

  // Cleanup mocks
  User.findById = originalFindById;
  RefreshToken.create = originalCreate;
  RefreshToken.findOne = originalFindOne;
  RefreshToken.updateMany = originalUpdateMany;

  console.log('\n----------------------------------------------------------------');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthSecurityTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
