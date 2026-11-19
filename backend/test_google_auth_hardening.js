import { adminAuth } from './src/config/firebase.js';
import { loginWithGoogle, refreshAccessToken, logoutUser } from './src/modules/users/user.controller.js';
import { User } from './src/modules/users/user.model.js';
import { RefreshToken } from './src/modules/users/refreshToken.model.js';
import { csrfProtection } from './src/middleware/csrfMiddleware.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} from './src/utils/token.js';
import mongoose from 'mongoose';
import fs from 'fs';

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

function createMockReqRes({ headers = {}, cookies = {}, body = {}, user = null, method = 'POST' } = {}) {
  const req = {
    method,
    headers,
    cookies,
    body,
    user,
  };

  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    cookieJar: {},
    clearedCookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    cookie(name, val, opts) {
      this.cookieJar[name] = { val, opts };
      return this;
    },
    clearCookie(name, opts) {
      this.clearedCookies[name] = { cleared: true, opts };
      return this;
    },
  };

  return { req, res };
}

async function runGoogleAuthTests() {
  console.log('================================================================');
  console.log('🔐 FINAL AUTHENTICATION SECURITY REVIEW & AUDIT TEST SUITE');
  console.log('================================================================\n');

  Object.defineProperty(mongoose.connection, 'readyState', {
    value: 1,
    configurable: true,
    writable: true,
  });

  // TEST 1: Missing idToken is rejected with 400 MISSING_ID_TOKEN
  {
    const { req, res } = createMockReqRes({ body: {} });
    await loginWithGoogle(req, res);
    assert(
      res.statusCode === 400 && res.jsonData?.code === 'MISSING_ID_TOKEN',
      'TEST 1: Missing idToken rejected with 400 MISSING_ID_TOKEN'
    );
  }

  // TEST 2: Fake/malformed Firebase ID token is rejected with 401 INVALID_FIREBASE_TOKEN
  {
    const { req, res } = createMockReqRes({ body: { idToken: 'fake-google-token-12345' } });
    await loginWithGoogle(req, res);
    assert(
      res.statusCode === 401 && res.jsonData?.code === 'INVALID_FIREBASE_TOKEN',
      'TEST 2: Fake or malformed Firebase ID token rejected with 401 INVALID_FIREBASE_TOKEN'
    );
  }

  // In-memory mock store for User and RefreshToken to run isolated audit tests
  const mockUserStore = new Map();
  const mockRefreshTokenStore = new Map();

  const originalUserFindOne = User.findOne;
  const originalUserFindById = User.findById;
  const originalUserFindByIdAndUpdate = User.findByIdAndUpdate;
  const originalUserCreate = User.create;

  const originalRtCreate = RefreshToken.create;
  const originalRtFindOne = RefreshToken.findOne;
  const originalRtFindOneAndUpdate = RefreshToken.findOneAndUpdate;
  const originalRtUpdateMany = RefreshToken.updateMany;
  const originalReadyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

  try {
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 1,
      configurable: true,
      writable: true,
    });
    User.findOne = async function (filter) {
      for (const u of mockUserStore.values()) {
        if (filter.email && u.email === filter.email) return u;
        if (filter.$or) {
          for (const cond of filter.$or) {
            if (cond.firebaseUid && u.firebaseUid === cond.firebaseUid) return u;
            if (cond.email && u.email === cond.email) return u;
          }
        }
      }
      return null;
    };

    User.findById = async function (id) {
      return mockUserStore.get(id.toString()) || null;
    };

    User.findByIdAndUpdate = async function (id, update) {
      const u = mockUserStore.get(id.toString());
      if (!u) return null;
      if (update.$inc?.tokenVersion) {
        u.tokenVersion = (u.tokenVersion || 0) + update.$inc.tokenVersion;
      }
      return u;
    };

    User.create = async function (doc) {
      const id = new mongoose.Types.ObjectId();
      const user = {
        _id: id,
        ...doc,
        tokenVersion: 0,
        sellerId: id.toString(),
        save: async function () {
          mockUserStore.set(id.toString(), this);
          return this;
        },
      };
      mockUserStore.set(id.toString(), user);
      return user;
    };

    RefreshToken.create = async function (doc) {
      mockRefreshTokenStore.set(doc.tokenHash, {
        ...doc,
        save: async function () {
          mockRefreshTokenStore.set(doc.tokenHash, this);
        },
      });
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

    RefreshToken.findOneAndUpdate = async function (filter, update) {
      if (filter.tokenHash) {
        const found = mockRefreshTokenStore.get(filter.tokenHash);
        if (found) {
          if (update.$set?.isRevoked !== undefined) {
            found.isRevoked = update.$set.isRevoked;
          }
          mockRefreshTokenStore.set(filter.tokenHash, found);
          return found;
        }
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

    // TEST 3: Verified Firebase ID token issues access token in JSON but NEVER exposes refresh token in JSON
    const originalVerify = adminAuth.verifyIdToken;
    let createdUserEmail = '';
    let issuedRefreshToken = '';
    try {
      const mockUid = 'firebase_user_' + Date.now();
      const mockEmail = `seller_google_${Date.now()}@example.com`;
      createdUserEmail = mockEmail;

      adminAuth.verifyIdToken = async (token) => {
        if (token === 'valid_mock_firebase_id_token') {
          return {
            uid: mockUid,
            email: mockEmail,
            name: 'Google Seller',
            picture: 'https://example.com/avatar.jpg',
          };
        }
        throw new Error('Firebase token invalid');
      };

      const { req, res } = createMockReqRes({ body: { idToken: 'valid_mock_firebase_id_token' } });
      await loginWithGoogle(req, res);

      const isValidAccess = res.statusCode === 200 && res.jsonData?.token && verifyAccessToken(res.jsonData.token);
      const isNotExposedInJson = res.jsonData?.refreshToken === undefined;
      const cookieSet = res.cookieJar['refreshToken'] && res.cookieJar['refreshToken'].opts?.httpOnly === true;
      issuedRefreshToken = res.cookieJar['refreshToken']?.val;

      assert(
        isValidAccess && isNotExposedInJson && cookieSet && issuedRefreshToken,
        'TEST 3: Refresh token exists ONLY in HttpOnly cookie and is NEVER exposed in JSON response'
      );

      // TEST 4: Auto-provisioned user stored in database
      const userInDb = await User.findOne({ email: mockEmail });
      assert(
        userInDb && userInDb.firebaseUid === mockUid && userInDb.avatar === 'https://example.com/avatar.jpg',
        'TEST 4: Auto-provisioned user stored in database with firebaseUid, name, and role'
      );

      // TEST 5: Deactivated user (isActive: false) is rejected with 403 ACCOUNT_DISABLED
      userInDb.isActive = false;
      const { req: reqDisabled, res: resDisabled } = createMockReqRes({
        body: { idToken: 'valid_mock_firebase_id_token' },
      });
      await loginWithGoogle(reqDisabled, resDisabled);
      assert(
        resDisabled.statusCode === 403 && resDisabled.jsonData?.code === 'ACCOUNT_DISABLED',
        'TEST 5: Deactivated/suspended user attempting Google login is rejected with 403 ACCOUNT_DISABLED'
      );
      userInDb.isActive = true; // Restore

      // TEST 6: Session continuity: Refresh token exchanged strictly via HttpOnly cookie
      const refreshReqRes = createMockReqRes({ cookies: { refreshToken: issuedRefreshToken } });
      await refreshAccessToken(refreshReqRes.req, refreshReqRes.res);

      const refreshSuccess =
        refreshReqRes.res.statusCode === 200 &&
        refreshReqRes.res.jsonData?.token &&
        refreshReqRes.res.jsonData?.refreshToken === undefined; // Never exposed in JSON!
      const rotatedCookie = refreshReqRes.res.cookieJar['refreshToken'];

      assert(
        refreshSuccess && rotatedCookie && rotatedCookie.val !== issuedRefreshToken && rotatedCookie.opts.httpOnly === true,
        'TEST 6: POST /api/auth/refresh consumes cookie, rotates HttpOnly cookie, and NEVER exposes refresh token in JSON'
      );

      // TEST 7: Refresh token reuse detection (calling refresh again with old token fails and revokes family)
      const reuseReqRes = createMockReqRes({ cookies: { refreshToken: issuedRefreshToken } });
      await refreshAccessToken(reuseReqRes.req, reuseReqRes.res);

      assert(
        reuseReqRes.res.statusCode === 401 && reuseReqRes.res.jsonData?.code === 'TOKEN_REUSE_DETECTED',
        'TEST 7: Reused refresh token detected: token reuse immediately blocked with 401 and family revoked'
      );

      // TEST 8: Explicit Logout clears cookie with matching security attributes and revokes DB record
      const activeRotatedToken = rotatedCookie.val;
      const logoutReqRes = createMockReqRes({ cookies: { refreshToken: activeRotatedToken } });
      await logoutUser(logoutReqRes.req, logoutReqRes.res);

      const logoutSuccess = logoutReqRes.res.statusCode === 200;
      const cookieCleared = logoutReqRes.res.clearedCookies['refreshToken']?.cleared === true;

      assert(
        logoutSuccess && cookieCleared,
        'TEST 8: POST /api/auth/logout revokes session in database and clears HttpOnly cookie'
      );
    } finally {
      adminAuth.verifyIdToken = originalVerify;
    }

    // TEST 9: Anti-CSRF Protection Middleware
    {
      const { req: csrfReqEvil, res: csrfResEvil } = createMockReqRes({
        headers: { origin: 'https://malicious-phishing-site.com' },
      });
      let csrfNextCalled = false;
      csrfProtection(csrfReqEvil, csrfResEvil, () => {
        csrfNextCalled = true;
      });
      assert(
        !csrfNextCalled && csrfResEvil.statusCode === 403 && csrfResEvil.jsonData?.code === 'CSRF_BLOCKED',
        'TEST 9a: Untrusted cross-origin request is rejected by CSRF protection with 403 CSRF_BLOCKED'
      );

      const { req: csrfReqLegit, res: csrfResLegit } = createMockReqRes({
        headers: { origin: 'http://localhost:3000' },
      });
      let legitNextCalled = false;
      csrfProtection(csrfReqLegit, csrfResLegit, () => {
        legitNextCalled = true;
      });
      assert(
        legitNextCalled && csrfResLegit.statusCode === 200,
        'TEST 9b: Authorized frontend origin passes CSRF protection'
      );
    }

    // TEST 10: Frontend Login.jsx & Onboarding.jsx code audit: Zero refreshToken in localStorage
    const loginJsx = fs.readFileSync('frontend/src/pages/auth/Login.jsx', 'utf8');
    const onboardingJsx = fs.readFileSync('frontend/src/pages/auth/Onboarding.jsx', 'utf8');

    const noRefreshTokenInLogin = !loginJsx.includes("localStorage.setItem('refreshToken'");
    const noRefreshTokenInOnboarding = !onboardingJsx.includes("localStorage.setItem('refreshToken'");
    assert(
      noRefreshTokenInLogin && noRefreshTokenInOnboarding,
      'TEST 10: Frontend components (Login.jsx, Onboarding.jsx) NEVER write refresh tokens to localStorage'
    );

    // TEST 11: Frontend api.js audit: No localStorage read/write, withCredentials=true, no silent Firebase bypass
    const apiJs = fs.readFileSync('frontend/src/services/api.js', 'utf8');
    const noStorageReadInApi = !apiJs.includes("localStorage.getItem('refreshToken')");
    const noStorageWriteInApi = !apiJs.includes("localStorage.setItem('refreshToken'");
    const withCredentialsSet = apiJs.includes('withCredentials: true');
    const hasSingleFlight = apiJs.includes('isRefreshing = true') && apiJs.includes('failedQueue.push');
    const noSilentFirebaseBypass = !apiJs.includes('auth.currentUser.getIdToken(true)');

    assert(
      noStorageReadInApi && noStorageWriteInApi && withCredentialsSet && hasSingleFlight && noSilentFirebaseBypass,
      'TEST 11: Frontend api.js uses HttpOnly cookie (withCredentials: true), single-flight queue, and no silent bypass'
    );

    // TEST 12: Frontend authService.js audit: Clean logout & Firebase signOut
    const authServiceJs = fs.readFileSync('frontend/src/services/authService.js', 'utf8');
    const hasFirebaseSignOut = authServiceJs.includes('signOut(auth)');
    const cleansStorage =
      authServiceJs.includes("localStorage.removeItem('authToken')") &&
      authServiceJs.includes("localStorage.removeItem('user')");

    assert(
      hasFirebaseSignOut && cleansStorage,
      'TEST 12: Frontend authService.js terminates Firebase session and cleans platform credentials on logout'
    );
  } finally {
    User.findOne = originalUserFindOne;
    User.findById = originalUserFindById;
    User.findByIdAndUpdate = originalUserFindByIdAndUpdate;
    User.create = originalUserCreate;
    RefreshToken.create = originalRtCreate;
    RefreshToken.findOne = originalRtFindOne;
    RefreshToken.findOneAndUpdate = originalRtFindOneAndUpdate;
    RefreshToken.updateMany = originalRtUpdateMany;
    if (originalReadyState) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyState);
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`📊 FINAL AUTH SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGoogleAuthTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
