import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'http';
import path from 'path';
import mongoose from 'mongoose';

import app from '../src/app.js';
import { config } from '../src/config/env.js';
import {
  generateOAuthState,
  encryptCredentials,
  decryptCredentials,
  clearConsumedOAuthStates,
} from '../src/utils/encryption.js';
import { ConsumedOAuthNonce } from '../src/modules/channels/consumedOAuthNonce.model.js';
import { ChannelConnection } from '../src/modules/channels/channelConnection.model.js';
import { Product } from '../src/modules/products/product.model.js';
import { inMemorySubmissionsMap } from '../src/modules/channels/marketplaceListingSubmission.model.js';
import {
  getAmazonOAuthUrlService,
  handleAmazonOAuthCallbackService,
  connectAmazonManualService,
  testAmazonConnectionService,
  disconnectAmazonService,
  inMemoryChannelsMap,
} from '../src/modules/channels/channel.service.js';
import {
  clearLwaTokenCache,
  exchangeLwaAuthCode,
  handleAmazonAuth,
} from '../src/integrations/marketplaces/amazon/amazon.auth.js';
import {
  AmazonSpApiClient,
  AMAZON_EXECUTION_OUTCOMES,
} from '../src/integrations/marketplaces/amazon/amazon.client.js';
import {
  INDIA_MARKETPLACE_ID,
  parseMarketplaceParticipationsResponse,
  getMarketplaceParticipations,
  verifyAmazonSellerAuthorization,
} from '../src/integrations/marketplaces/amazon/amazon.sellers.service.js';
import {
  searchProductTypes,
  getProductTypeDefinition,
  validatePayloadAgainstProductTypeSchema,
  clearDefinitionsCache,
} from '../src/integrations/marketplaces/amazon/amazon.definitions.service.js';
import { executeListingSubmission } from '../src/integrations/marketplaces/amazon/amazon.publisher.service.js';

mongoose.set('bufferCommands', false);

const createJsonFetchResponse = (payload, { ok = true, status = 200, headers = {} } = {}) => ({
  ok,
  status,
  headers: new Headers(headers),
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

/**
 * In-process Express request runner (avoids loopback socket restrictions in sandboxed environments)
 */
const invokeExpress = (expressApp, { method = 'GET', url = '/', headers = {}, body = null } = {}) =>
  new Promise((resolve, reject) => {
    const lowerHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    const req = Object.create(http.IncomingMessage.prototype);
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = lowerHeaders;
    req.socket = { remoteAddress: '127.0.0.1', encrypted: false };
    req.connection = req.socket;
    req.httpVersion = '1.1';
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;

    const rawBody =
      body !== null && body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (rawBody !== null && !lowerHeaders['content-length']) {
      lowerHeaders['content-length'] = String(Buffer.byteLength(rawBody));
    }
    if (body && typeof body === 'object' && !lowerHeaders['content-type']) {
      lowerHeaders['content-type'] = 'application/json';
    }
    req._read = () => {};
    req.on = function (event, cb) {
      if (!this._listeners) this._listeners = {};
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(cb);
      return this;
    };
    req.once = req.on;
    req.emit = function (event, ...args) {
      const fns = this._listeners?.[event] || [];
      for (const fn of fns) fn(...args);
      return fns.length > 0;
    };
    req.removeListener = function () { return this; };
    req.resume = function () { return this; };
    req.pause = function () { return this; };
    req.pipe = function () { return this; };
    req.body = body && typeof body === 'object' ? body : undefined;

    const responseHeaders = {};
    const chunks = [];
    let resolved = false;
    let headersSentFlag = false;

    const res = Object.create(http.ServerResponse.prototype);
    res.statusCode = 200;
    res.locals = {};
    Object.defineProperty(res, 'headersSent', {
      get: () => headersSentFlag,
      configurable: true,
    });
    res.setHeader = (name, value) => {
      responseHeaders[String(name).toLowerCase()] = value;
    };
    res.getHeader = (name) => responseHeaders[String(name).toLowerCase()];
    res.removeHeader = (name) => {
      delete responseHeaders[String(name).toLowerCase()];
    };
    res.hasHeader = (name) => Object.prototype.hasOwnProperty.call(responseHeaders, String(name).toLowerCase());
    res.getHeaders = () => ({ ...responseHeaders });
    res.writeHead = (code, hdrs = {}) => {
      res.statusCode = code;
      for (const [k, v] of Object.entries(hdrs)) {
        responseHeaders[String(k).toLowerCase()] = v;
      }
      headersSentFlag = true;
      return res;
    };
    res.write = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    };
    res.end = (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      headersSentFlag = true;
      if (!resolved) {
        resolved = true;
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode, headers: responseHeaders, text, json });
      }
      return res;
    };
    res.on = () => res;
    res.once = () => res;
    res.emit = () => false;

    try {
      expressApp(req, res, (err) => {
        if (!resolved) {
          resolved = true;
          if (err) reject(err);
          else resolve({ status: res.statusCode, headers: responseHeaders, text: '', json: null });
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    }
  });

/**
 * Helper to mock MongoDB ConsumedOAuthNonce atomic single-use store in memory
 */
const installMockNonceStore = () => {
  const originalCreate = ConsumedOAuthNonce.create;
  const consumed = new Set();
  ConsumedOAuthNonce.create = async ({ nonce }) => {
    if (consumed.has(nonce)) {
      const dupErr = new Error('E11000 duplicate key error collection: consumedoauthnonces');
      dupErr.code = 11000;
      throw dupErr;
    }
    consumed.add(nonce);
    return { nonce };
  };
  return () => {
    ConsumedOAuthNonce.create = originalCreate;
    consumed.clear();
  };
};

const INDIA_PARTICIPATIONS_PAYLOAD = {
  payload: [
    {
      marketplace: {
        id: 'A21TJRUUN4KGV',
        name: 'Amazon.in',
        countryCode: 'IN',
        defaultCurrencyCode: 'INR',
        defaultLanguageCode: 'en_IN',
        domainName: 'www.amazon.in',
      },
      participation: {
        isParticipating: true,
        hasSuspendedListings: false,
      },
      storeName: 'Phase 2B India Sandbox Store',
    },
  ],
};

// =========================================================================
// TEST 1: Public GET /api/channels/amazon/oauth/callback works without Bearer token
// =========================================================================
test('1. Public GET /api/channels/amazon/oauth/callback works without Bearer token and redirects to CLIENT_URL', async () => {
  clearLwaTokenCache();
  clearConsumedOAuthStates();
  inMemoryChannelsMap.clear();

  const restoreNonce = installMockNonceStore();
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientUrl = process.env.CLIENT_URL;
  const originalRedirectUri = config.amazon.redirectUri;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  let persistedPayload = null;
  const capturedLwaBodies = [];
  let sellersApiCalled = false;

  try {
    process.env.CLIENT_URL = 'https://seller-ui.example.com';
    config.amazon.redirectUri = 'https://api.example.com/api/channels/amazon/oauth/callback';
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-test';
    config.amazon.clientSecret = 'sandbox-secret-test';

    const state = generateOAuthState('507f1f77bcf86cd799439011', 'AMAZON', 10 * 60 * 1000, {
      storeId: '507f1f77bcf86cd799439022',
      region: 'eu',
    });

    ChannelConnection.findOneAndUpdate = async (_filter, update) => {
      persistedPayload = update.$set || update;
      return {
        _id: 'conn-phase2b-1',
        ...persistedPayload,
      };
    };

    global.fetch = async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('api.amazon.com/auth/o2/token')) {
        capturedLwaBodies.push(String(init?.body || ''));
        return createJsonFetchResponse(
          {
            access_token: 'Atza|sandbox-access-token-001',
            refresh_token: 'Atzr|sandbox-refresh-token-001',
            token_type: 'bearer',
            expires_in: 3600,
          },
          { headers: { 'x-amzn-requestid': 'req-lwa-001' } }
        );
      }
      if (urlStr.includes('/sellers/v1/marketplaceParticipations')) {
        sellersApiCalled = true;
        assert.ok(
          urlStr.startsWith('https://sandbox.sellingpartnerapi-eu.amazon.com/sellers/v1/marketplaceParticipations'),
          'Must target EU Sandbox Sellers API endpoint'
        );
        return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD, {
          headers: { 'x-amzn-requestid': 'req-sellers-001' },
        });
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    };

    // No Authorization header at all (browser redirect from Amazon Seller Central)
    const query = new URLSearchParams({
      spapi_oauth_code: 'ANsandboxAuthCode999',
      selling_partner_id: 'A2SANDBOXSELLER1',
      state,
    }).toString();

    const res = await invokeExpress(app, {
      method: 'GET',
      url: `/api/channels/amazon/oauth/callback?${query}`,
    });

    assert.equal(res.status, 302, 'Public browser callback must issue HTTP 302 redirect');
    assert.equal(
      res.headers.location,
      'https://seller-ui.example.com/channels/amazon?status=connected',
      'Must redirect to configured CLIENT_URL frontend route, never a relative backend URL'
    );
    assert.equal(sellersApiCalled, true, 'Sellers API verification must be invoked during OAuth callback');
    const authCodeExchangeBody = capturedLwaBodies.find((b) => b.includes('grant_type=authorization_code')) || '';
    const authCodeParams = new URLSearchParams(authCodeExchangeBody);
    assert.equal(
      authCodeParams.get('redirect_uri'),
      'https://api.example.com/api/channels/amazon/oauth/callback',
      'LWA token exchange must send exact configured redirect_uri'
    );
    assert.ok(persistedPayload, 'Connection must be persisted in MongoDB');
    assert.equal(persistedPayload.sellerId, '507f1f77bcf86cd799439011');
    assert.equal(persistedPayload.storeId, '507f1f77bcf86cd799439022');
    assert.equal(persistedPayload.status, 'CONNECTED');
    assert.equal(persistedPayload.environment, 'sandbox');
    assert.equal(persistedPayload.sellingPartnerId, 'A2SANDBOXSELLER1');
    assert.equal(persistedPayload.marketplaceId, 'A21TJRUUN4KGV');
    assert.deepEqual(persistedPayload.metadata.authorizedMarketplaceIds, ['A21TJRUUN4KGV']);
    assert.equal(persistedPayload.metadata.hasIndiaMarketplace, true);

    const decrypted = decryptCredentials(persistedPayload.credentials);
    assert.equal(decrypted.refreshToken, 'Atzr|sandbox-refresh-token-001');
    assert.equal(decrypted.sellingPartnerId, 'A2SANDBOXSELLER1');
  } finally {
    restoreNonce();
    global.fetch = originalFetch;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
    config.amazon.redirectUri = originalRedirectUri;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 2: Invalid, expired, and replayed OAuth states rejected with sanitized codes
// =========================================================================
test('2. Invalid, expired, and replayed OAuth states fail closed with sanitized redirect codes (no secret leak)', async () => {
  clearConsumedOAuthStates();
  const restoreNonce = installMockNonceStore();
  const originalClientUrl = process.env.CLIENT_URL;
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    process.env.CLIENT_URL = 'https://seller-ui.example.com';
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-test';
    config.amazon.clientSecret = 'sandbox-secret-test';

    // 2a. Invalid / tampered state
    const badRes = await invokeExpress(app, {
      method: 'GET',
      url: '/api/channels/amazon/oauth/callback?spapi_oauth_code=code1&state=tampered.invalid.state',
    });
    assert.equal(badRes.status, 302);
    assert.equal(
      badRes.headers.location,
      'https://seller-ui.example.com/channels/amazon?status=error&code=INVALID_OAUTH_STATE'
    );
    assert.ok(!badRes.headers.location.includes('message='), 'Must never expose raw error messages in redirect');

    // 2b. Expired state
    const expiredState = generateOAuthState('507f1f77bcf86cd799439011', 'AMAZON', -5000);
    const expRes = await invokeExpress(app, {
      method: 'GET',
      url: `/api/channels/amazon/oauth/callback?spapi_oauth_code=code2&state=${encodeURIComponent(expiredState)}`,
    });
    assert.equal(expRes.status, 302);
    assert.equal(
      expRes.headers.location,
      'https://seller-ui.example.com/channels/amazon?status=error&code=OAUTH_STATE_EXPIRED'
    );

    // 2c. Replay attack (same valid state submitted twice)
    ChannelConnection.findOneAndUpdate = async (_filter, update) => ({
      _id: 'conn-replay-1',
      ...(update.$set || update),
    });
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({
          access_token: 'Atza|token-replay-check',
          refresh_token: 'Atzr|refresh-replay-check',
          expires_in: 3600,
        });
      }
      return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD);
    };

    const singleUseState = generateOAuthState('507f1f77bcf86cd799439011', 'AMAZON', 60_000);
    const first = await invokeExpress(app, {
      method: 'GET',
      url: `/api/channels/amazon/oauth/callback?spapi_oauth_code=code3&selling_partner_id=A2MERCHANT1&state=${encodeURIComponent(singleUseState)}`,
    });
    assert.equal(first.status, 302);
    assert.equal(first.headers.location, 'https://seller-ui.example.com/channels/amazon?status=connected');

    const replay = await invokeExpress(app, {
      method: 'GET',
      url: `/api/channels/amazon/oauth/callback?spapi_oauth_code=code3&selling_partner_id=A2MERCHANT1&state=${encodeURIComponent(singleUseState)}`,
    });
    assert.equal(replay.status, 302);
    assert.equal(
      replay.headers.location,
      'https://seller-ui.example.com/channels/amazon?status=error&code=OAUTH_STATE_REPLAY'
    );
  } finally {
    restoreNonce();
    global.fetch = originalFetch;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 3: Cross-tenant state rejection and impersonation prevention
// =========================================================================
test('3. Cross-tenant state rejection prevents Seller B from claiming Seller A state or impersonating via query params', async () => {
  clearConsumedOAuthStates();
  const restoreNonce = installMockNonceStore();
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-test';
    config.amazon.clientSecret = 'sandbox-secret-test';

    // 3a. Authenticated POST with Seller B presenting Seller A's signed state
    const sellerAState = generateOAuthState('507f1f77bcf86cd799439011', 'AMAZON', 60_000);
    await assert.rejects(
      () =>
        handleAmazonOAuthCallbackService(
          { sellerId: '507f1f77bcf86cd799439099', storeId: 'store-B' },
          { spapi_oauth_code: 'ANcodeX', state: sellerAState, selling_partner_id: 'A2MERCHANTB' }
        ),
      (err) => err.code === 'CROSS_TENANT_STATE_MISMATCH' && err.status === 403
    );

    // 3b. Public GET callback ignores injected sellerId/storeId query params and binds strictly to signed state
    let persistedPayload = null;
    ChannelConnection.findOneAndUpdate = async (_filter, update) => {
      persistedPayload = update.$set || update;
      return { _id: 'conn-isolated', ...persistedPayload };
    };
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({
          access_token: 'Atza|isolated',
          refresh_token: 'Atzr|isolated',
          expires_in: 3600,
        });
      }
      return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD);
    };

    const stateForA = generateOAuthState('507f1f77bcf86cd799439011', 'AMAZON', 60_000, {
      storeId: '507f1f77bcf86cd799439022',
    });
    const res = await invokeExpress(app, {
      method: 'GET',
      url: `/api/channels/amazon/oauth/callback?spapi_oauth_code=codeA&selling_partner_id=A2REAL&sellerId=ATTACKER_ID&storeId=ATTACKER_STORE&state=${encodeURIComponent(stateForA)}`,
    });
    assert.equal(res.status, 302);
    assert.equal(persistedPayload.sellerId, '507f1f77bcf86cd799439011', 'Must bind ONLY to signed state sellerId');
    assert.equal(persistedPayload.storeId, '507f1f77bcf86cd799439022', 'Must bind ONLY to signed state storeId');
  } finally {
    restoreNonce();
    global.fetch = originalFetch;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 4: DB failure during OAuth nonce verification fails closed (503)
// =========================================================================
test('4. Database outage during OAuth nonce verification fails closed with OAUTH_STATE_STORE_UNAVAILABLE', async () => {
  clearConsumedOAuthStates();
  const originalCreate = ConsumedOAuthNonce.create;
  const originalClientUrl = process.env.CLIENT_URL;

  try {
    process.env.CLIENT_URL = 'https://seller-ui.example.com';
    ConsumedOAuthNonce.create = async () => {
      throw new Error('MongoNetworkError: connection timed out with secret=topsecret123');
    };

    const validState = generateOAuthState('507f1f77bcf86cd799439011', 'AMAZON', 60_000);

    // Direct service check
    await assert.rejects(
      () =>
        handleAmazonOAuthCallbackService(null, {
          spapi_oauth_code: 'ANcodeDBFail',
          state: validState,
          selling_partner_id: 'A2MERCHANT1',
        }),
      (err) => err.code === 'OAUTH_STATE_STORE_UNAVAILABLE' && err.status === 503
    );

    // Public HTTP redirect check (must not leak Mongo error text)
    const res = await invokeExpress(app, {
      method: 'GET',
      url: `/api/channels/amazon/oauth/callback?spapi_oauth_code=ANcodeDBFail&state=${encodeURIComponent(validState)}`,
    });
    assert.equal(res.status, 302);
    assert.equal(
      res.headers.location,
      'https://seller-ui.example.com/channels/amazon?status=error&code=OAUTH_STATE_STORE_UNAVAILABLE'
    );
    assert.ok(!res.headers.location.includes('topsecret123'), 'Must never leak raw DB error strings');
  } finally {
    ConsumedOAuthNonce.create = originalCreate;
    if (originalClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = originalClientUrl;
  }
});

// =========================================================================
// TEST 5: OAuth URL generation & LWA code exchange redirect_uri alignment
// =========================================================================
test('5. OAuth URL defaults to sandbox EU with exact redirect_uri matching LWA token exchange', async () => {
  const originalRedirectUri = config.amazon.redirectUri;
  const originalAppId = config.amazon.appId;
  const originalEnv = config.amazon.env;
  const originalFetch = global.fetch;

  try {
    config.amazon.appId = 'amzn1.sp.solution.sandbox-app-123';
    config.amazon.redirectUri = 'http://localhost:5000/api/channels/amazon/oauth/callback';
    config.amazon.env = 'sandbox';

    const oauthInfo = await getAmazonOAuthUrlService(
      { sellerId: '507f1f77bcf86cd799439011', storeId: '507f1f77bcf86cd799439022' },
      { region: 'eu' }
    );

    const parsed = new URL(oauthInfo.authorizationUrl);
    assert.equal(parsed.origin, 'https://sellercentral.amazon.in');
    assert.equal(parsed.searchParams.get('application_id'), 'amzn1.sp.solution.sandbox-app-123');
    assert.equal(parsed.searchParams.get('version'), 'beta', 'Sandbox OAuth URL must include version=beta');
    assert.equal(
      parsed.searchParams.get('redirect_uri'),
      'http://localhost:5000/api/channels/amazon/oauth/callback'
    );
    assert.equal(oauthInfo.environment, 'sandbox');
    assert.equal(oauthInfo.redirectUri, 'http://localhost:5000/api/channels/amazon/oauth/callback');

    let sentParams = null;
    global.fetch = async (url, init) => {
      assert.equal(url, 'https://api.amazon.com/auth/o2/token');
      sentParams = new URLSearchParams(init.body);
      return createJsonFetchResponse({
        access_token: 'Atza|code-exchanged',
        refresh_token: 'Atzr|code-exchanged',
        expires_in: 3600,
      });
    };

    const tokens = await exchangeLwaAuthCode('ANtestCode', {
      clientId: 'amzn1.client.test',
      clientSecret: 'secret-test',
      redirectUri: oauthInfo.redirectUri,
    });

    assert.equal(tokens.refreshToken, 'Atzr|code-exchanged');
    assert.equal(sentParams.get('grant_type'), 'authorization_code');
    assert.equal(sentParams.get('code'), 'ANtestCode');
    assert.equal(
      sentParams.get('redirect_uri'),
      'http://localhost:5000/api/channels/amazon/oauth/callback',
      'LWA code exchange redirect_uri must match authorization URL exactly'
    );
  } finally {
    config.amazon.redirectUri = originalRedirectUri;
    config.amazon.appId = originalAppId;
    config.amazon.env = originalEnv;
    global.fetch = originalFetch;
  }
});

// =========================================================================
// TEST 6: Sellers API parsing & error handling (401, 403, 429, empty, network)
// =========================================================================
test('6. Sellers API GET /sellers/v1/marketplaceParticipations handles India A21TJRUUN4KGV and 401/403/429/empty/network', async () => {
  // 6a. Parse official payload
  const parsed = parseMarketplaceParticipationsResponse(INDIA_PARTICIPATIONS_PAYLOAD);
  assert.equal(parsed.hasIndiaMarketplace, true);
  assert.deepEqual(parsed.authorizedMarketplaceIds, [INDIA_MARKETPLACE_ID]);
  assert.equal(parsed.indiaParticipation.countryCode, 'IN');

  // 6b. 401 Unauthorized
  const mock401Client = {
    environment: 'sandbox',
    region: 'eu',
    executeRequest: async () => {
      const e = new Error('Unauthorized');
      e.status = 401;
      e.requestId = 'req-401';
      throw e;
    },
  };
  const res401 = await verifyAmazonSellerAuthorization(mock401Client, { sellingPartnerId: 'A2TEST' });
  assert.equal(res401.verified, false);
  assert.equal(res401.code, 'LWA_UNAUTHORIZED');
  assert.equal(res401.status, 401);
  assert.equal(res401.executionOutcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE);

  // 6c. 403 Forbidden
  const mock403Client = {
    environment: 'sandbox',
    region: 'eu',
    executeRequest: async () => {
      const e = new Error('Access to requested resource is denied.');
      e.status = 403;
      e.requestId = 'req-403';
      throw e;
    },
  };
  const res403 = await verifyAmazonSellerAuthorization(mock403Client, { sellingPartnerId: 'A2TEST' });
  assert.equal(res403.verified, false);
  assert.equal(res403.code, 'SP_API_FORBIDDEN');
  assert.equal(res403.status, 403);

  // 6d. 429 Rate Limited
  const mock429Client = {
    environment: 'sandbox',
    region: 'eu',
    executeRequest: async () => {
      const e = new Error('QuotaExceeded');
      e.status = 429;
      e.retryAfter = '12';
      throw e;
    },
  };
  const res429 = await verifyAmazonSellerAuthorization(mock429Client, { sellingPartnerId: 'A2TEST' });
  assert.equal(res429.verified, false);
  assert.equal(res429.code, 'RATE_LIMITED');
  assert.equal(res429.status, 429);

  // 6e. Empty marketplace participations
  const mockEmptyClient = {
    environment: 'sandbox',
    region: 'eu',
    executeRequest: async () => ({ payload: [], _metadata: { status: 200, requestId: 'req-empty' } }),
  };
  const resEmpty = await verifyAmazonSellerAuthorization(mockEmptyClient, { sellingPartnerId: 'A2TEST' });
  assert.equal(resEmpty.verified, false);
  assert.equal(resEmpty.code, 'EMPTY_MARKETPLACE_PARTICIPATIONS');

  // 6f. Authorized only for US (ATVPDKIKX0DER), missing India (A21TJRUUN4KGV)
  const mockUsOnlyClient = {
    environment: 'sandbox',
    region: 'eu',
    executeRequest: async () => ({
      payload: [
        {
          marketplace: { id: 'ATVPDKIKX0DER', name: 'Amazon.com', countryCode: 'US' },
          participation: { isParticipating: true },
        },
      ],
      _metadata: { status: 200, requestId: 'req-us' },
    }),
  };
  const resNoIndia = await verifyAmazonSellerAuthorization(mockUsOnlyClient, { sellingPartnerId: 'A2TEST' });
  assert.equal(resNoIndia.verified, false);
  assert.equal(resNoIndia.code, 'MARKETPLACE_NOT_AUTHORIZED');
  assert.equal(resNoIndia.hasIndiaMarketplace, false);

  // 6g. Network failure
  const mockNetErrClient = {
    environment: 'sandbox',
    region: 'eu',
    executeRequest: async () => {
      const e = new Error('fetch failed: ECONNREFUSED');
      e.code = 'ECONNREFUSED';
      throw e;
    },
  };
  const resNet = await verifyAmazonSellerAuthorization(mockNetErrClient, { sellingPartnerId: 'A2TEST' });
  assert.equal(resNet.verified, false);
  assert.equal(resNet.code, 'NETWORK_FAILURE');

  // 6h. getMarketplaceParticipations passes cache-bypass option through when requested
  let observedBypass = false;
  const mockOkClient = {
    credentials: {},
    executeRequest: async (endpoint, opts) => {
      assert.equal(endpoint, '/sellers/v1/marketplaceParticipations');
      observedBypass = opts?.bypassCache === true;
      return { ...INDIA_PARTICIPATIONS_PAYLOAD, _metadata: { status: 200, requestId: 'req-ok' } };
    },
  };
  const direct = await getMarketplaceParticipations(mockOkClient, { bypassCache: true });
  assert.equal(observedBypass, true, 'bypassCache option must be forwarded to executeRequest');
  assert.equal(direct.hasIndiaMarketplace, true);
});

// =========================================================================
// TEST 7: Seller & marketplace binding in manual connect & cache-bypassing test connection
// =========================================================================
test('7. Manual connect and Test Connection verify Sellers API (cache-bypassing) and refuse CONNECTED on failure', async () => {
  clearLwaTokenCache();
  inMemoryChannelsMap.clear();
  const originalFetch = global.fetch;
  const originalFindOne = ChannelConnection.findOne;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-test';
    config.amazon.clientSecret = 'sandbox-secret-test';

    let lwaCalls = 0;
    let savedDoc = null;
    ChannelConnection.findOneAndUpdate = async (_filter, update) => {
      const payload = update.$set || update;
      savedDoc = {
        _id: 'conn-manual-1',
        ...payload,
        save: async function () { return this; },
      };
      return savedDoc;
    };

    // 7a. Manual connect fails when Amazon returns empty participations (must NOT persist CONNECTED)
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        lwaCalls++;
        return createJsonFetchResponse({ access_token: `Atza|token-${lwaCalls}`, expires_in: 3600 });
      }
      return createJsonFetchResponse({ payload: [] });
    };

    await assert.rejects(
      () =>
        connectAmazonManualService(
          { sellerId: '507f1f77bcf86cd799439011', storeId: '507f1f77bcf86cd799439022' },
          {
            refreshToken: 'Atzr|manual-token-001',
            sellingPartnerId: 'A2MANUALSELLER1',
            region: 'eu',
          }
        ),
      (err) => err.code === 'EMPTY_MARKETPLACE_PARTICIPATIONS'
    );
    assert.equal(savedDoc, null, 'Must NOT save CONNECTED when Sellers API returns empty participations');

    // 7b. Manual connect succeeds when India A21TJRUUN4KGV is verified
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        lwaCalls++;
        return createJsonFetchResponse({ access_token: `Atza|token-${lwaCalls}`, expires_in: 3600 });
      }
      return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD, {
        headers: { 'x-amzn-requestid': 'req-manual-ok' },
      });
    };

    const manualRes = await connectAmazonManualService(
      { sellerId: '507f1f77bcf86cd799439011', storeId: '507f1f77bcf86cd799439022' },
      {
        refreshToken: 'Atzr|manual-token-001',
        sellingPartnerId: 'A2MANUALSELLER1',
        region: 'eu',
      }
    );
    assert.equal(manualRes.status, 'CONNECTED');
    assert.equal(manualRes.environment, 'sandbox');
    assert.equal(manualRes.sellingPartnerId, 'A2MANUALSELLER1');
    assert.deepEqual(manualRes.metadata.authorizedMarketplaceIds, ['A21TJRUUN4KGV']);

    // 7c. Test Connection MUST bypass LWA cache (forcing a fresh LWA call) and verify Sellers API
    ChannelConnection.findOne = async () => savedDoc;
    const callsBeforeTest = lwaCalls;
    const testOk = await testAmazonConnectionService({
      sellerId: '507f1f77bcf86cd799439011',
      storeId: '507f1f77bcf86cd799439022',
    });
    assert.equal(testOk.success, true);
    assert.equal(testOk.sellerAuthorized, true);
    assert.equal(testOk.status, 'CONNECTED');
    assert.equal(testOk.executionOutcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS);
    assert.ok(lwaCalls > callsBeforeTest, 'testAmazonConnectionService must bypass LWA token cache');

    // 7d. Test Connection returns REAUTH_REQUIRED when token is revoked (401)
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse(
          { error: 'invalid_grant', error_description: 'Token revoked' },
          { ok: false, status: 401 }
        );
      }
      throw new Error('Should not reach SP-API when LWA returns 401');
    };
    const testFail = await testAmazonConnectionService({
      sellerId: '507f1f77bcf86cd799439011',
      storeId: '507f1f77bcf86cd799439022',
    });
    assert.equal(testFail.success, false);
    assert.equal(testFail.sellerAuthorized, false);
    assert.equal(testFail.status, 'REAUTH_REQUIRED');
    assert.equal(savedDoc.status, 'REAUTH_REQUIRED');
    assert.equal(testFail.executionOutcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE);
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOne = originalFindOne;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 8: Disconnect and Reconnect lifecycle (evicts cache & re-verifies)
// =========================================================================
test('8. Disconnect evicts LWA token cache and wipes credentials; reconnect re-verifies seller authorization', async () => {
  clearLwaTokenCache();
  const originalFetch = global.fetch;
  const originalFindOne = ChannelConnection.findOne;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-test';
    config.amazon.clientSecret = 'sandbox-secret-test';

    const tenant = { sellerId: '507f1f77bcf86cd799439011', storeId: '507f1f77bcf86cd799439022' };
    const encrypted = encryptCredentials({
      clientId: config.amazon.clientId,
      clientSecret: config.amazon.clientSecret,
      refreshToken: 'Atzr|disconnect-test-token',
      sellingPartnerId: 'A2DISCONNECT1',
    });

    const connDoc = {
      _id: 'conn-disc-1',
      sellerId: tenant.sellerId,
      storeId: tenant.storeId,
      provider: 'AMAZON',
      status: 'CONNECTED',
      credentials: encrypted,
      metadata: { authorizedMarketplaceIds: ['A21TJRUUN4KGV'] },
      save: async function () { return this; },
    };

    // Prime LWA cache for this tenant
    let lwaFetchCount = 0;
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        lwaFetchCount++;
        return createJsonFetchResponse({ access_token: `Atza|cached-token-${lwaFetchCount}`, expires_in: 3600 });
      }
      return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD);
    };

    const creds = {
      clientId: config.amazon.clientId,
      clientSecret: config.amazon.clientSecret,
      refreshToken: 'Atzr|disconnect-test-token',
      tenantId: tenant.sellerId,
    };
    const tok1 = await handleAmazonAuth(creds);
    const tok2 = await handleAmazonAuth(creds);
    assert.equal(tok1.authenticated, true);
    assert.equal(tok1.accessToken, tok2.accessToken, 'Second call should hit LWA cache before disconnect');
    assert.equal(lwaFetchCount, 1);

    ChannelConnection.findOne = async () => connDoc;
    const discRes = await disconnectAmazonService(tenant);
    assert.equal(discRes.status, 'DISCONNECTED');
    assert.equal(connDoc.credentials, null);

    // Calling handleAmazonAuth after disconnect MUST miss cache and fetch a fresh token
    const tok3 = await handleAmazonAuth(creds);
    assert.equal(tok3.authenticated, true);
    assert.equal(lwaFetchCount, 2, 'Disconnect must evict tenant LWA cache so next auth misses cache');
    assert.notEqual(tok3.accessToken, tok1.accessToken);

    // Reconnect re-verifies seller authorization
    let sellersCalledOnReconnect = false;
    ChannelConnection.findOneAndUpdate = async (_filter, update) => ({
      _id: 'conn-disc-1',
      ...(update.$set || update),
    });
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({ access_token: 'Atza|reconnected', expires_in: 3600 });
      }
      if (String(url).includes('/sellers/v1/marketplaceParticipations')) {
        sellersCalledOnReconnect = true;
        return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD);
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const reconn = await connectAmazonManualService(tenant, {
      refreshToken: 'Atzr|new-reconnect-token',
      sellingPartnerId: 'A2RECONNECTED1',
      region: 'eu',
    });
    assert.equal(sellersCalledOnReconnect, true);
    assert.equal(reconn.status, 'CONNECTED');
    assert.equal(reconn.sellingPartnerId, 'A2RECONNECTED1');
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOne = originalFindOne;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 9: Wrong seller ID prevention in Amazon Listings Items PUT URL
// =========================================================================
test('9. Listing PUT URL strictly uses connection.sellingPartnerId, never internal MongoDB sellerId', async () => {
  clearDefinitionsCache();
  inMemorySubmissionsMap.clear();
  const internalMongoSellerId = '507f1f77bcf86cd799439099';
  const realSellingPartnerId = 'A2INDIAOFFICIAL99';

  const makeSubmission = (id) => ({
    _id: id,
    sellerId: internalMongoSellerId,
    sellerSku: 'SKU-SPID-001',
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    environment: 'sandbox',
    mappedAttributes: {
      title: 'Handcrafted Pure Cotton Casual Shirt',
      brand: 'Bhartiye Crafts',
      sellerSku: 'SKU-SPID-001',
      description: 'Breathable handloom cotton casual shirt crafted in India for everyday comfort.',
      bulletPoints: ['100% pure cotton', 'Breathable weave', 'Machine washable'],
      mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
      price: 1299,
      quantity: 15,
      gtinExemptionRequested: true,
    },
    gtinExemptionRequested: true,
    save: async function () { return this; },
  });

  // 9a. Client WITHOUT sellingPartnerId MUST fail with MISSING_SELLING_PARTNER_ID (never fall back to Mongo sellerId)
  let putAttempted = false;
  const clientWithoutSpId = {
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    executeRequest: async (_ep, opts) => {
      if (opts?.method === 'PUT') putAttempted = true;
      return { status: 'ACCEPTED', submissionId: 'should-not-happen' };
    },
  };

  const failRes = await executeListingSubmission(makeSubmission('sub-no-spid'), {
    client: clientWithoutSpId,
    dryRun: false,
    mode: 'SANDBOX_SUBMISSION',
    environment: 'sandbox',
  });
  assert.equal(failRes.success, false);
  assert.equal(failRes.errorCode, 'MISSING_SELLING_PARTNER_ID');
  assert.equal(failRes.amazonSubmissionId, null);
  assert.equal(putAttempted, false, 'Must NOT send PUT request without verified sellingPartnerId');

  // 9b. Client WITH sellingPartnerId uses connection.sellingPartnerId in PUT path
  let putEndpoint = '';
  const clientWithSpId = {
    credentials: { sellingPartnerId: realSellingPartnerId, marketplaceId: 'A21TJRUUN4KGV' },
    executeRequest: async (ep, opts) => {
      if (opts?.method === 'PUT') {
        putEndpoint = ep;
        return {
          status: 'ACCEPTED',
          submissionId: 'amzn-sub-real-001',
          issues: [],
          _metadata: { status: 200, requestId: 'req-put-001' },
        };
      }
      return {};
    },
  };

  const okRes = await executeListingSubmission(makeSubmission('sub-with-spid'), {
    client: clientWithSpId,
    dryRun: false,
    mode: 'SANDBOX_SUBMISSION',
    environment: 'sandbox',
  });
  assert.equal(okRes.success, true);
  assert.equal(okRes.executionOutcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS);
  assert.ok(
    putEndpoint.includes(`/listings/2021-08-01/items/${realSellingPartnerId}/SKU-SPID-001`),
    `Expected sellingPartnerId in PUT URL, got: ${putEndpoint}`
  );
  assert.ok(
    !putEndpoint.includes(internalMongoSellerId),
    'Internal MongoDB sellerId must NEVER appear in Amazon SP-API PUT URL'
  );
});

// =========================================================================
// TEST 10: Product Type dropdown compatibility (name & productType normalized)
// =========================================================================
test('10. Product Type search returns normalized name & productType fields and frontend uses pt.name || pt.productType', async () => {
  clearDefinitionsCache();

  // Mock SP-API client returning official Amazon shape { productTypes: [{ name: 'KURTA', displayName: 'Kurta' }] }
  const mockClient = {
    executeRequest: async (ep) => {
      assert.ok(ep.includes('/definitions/2020-09-01/productTypes'));
      return {
        productTypes: [{ name: 'KURTA', displayName: 'Traditional Kurta' }],
        _metadata: { status: 200, requestId: 'req-pt-1' },
      };
    },
  };

  const res = await searchProductTypes(mockClient, 'kurta', 'A21TJRUUN4KGV');
  assert.equal(res.source, 'AMAZON_SP_API');
  assert.equal(res.productTypes[0].name, 'KURTA');
  assert.equal(res.productTypes[0].productType, 'KURTA');

  // Verify frontend component reads pt.name || pt.productType (no broken pt.productType-only dropdown)
  const jsxPath = path.resolve(
    process.cwd(),
    'frontend/src/pages/marketplaces/AmazonListingPublisher.jsx'
  );
  const jsxSource = fs.readFileSync(jsxPath, 'utf8');
  assert.ok(
    jsxSource.includes('pt.name || pt.productType'),
    'AmazonListingPublisher dropdown must use pt.name || pt.productType'
  );
});

// =========================================================================
// TEST 11: Product Type schema retrieval, TTL caching & JSON Schema validation
// =========================================================================
test('11. Product Type schema retrieval uses authenticated client, caches results, and validates JSON Schema', async () => {
  clearDefinitionsCache();
  let apiCalls = 0;

  const mockClient = {
    executeRequest: async (ep) => {
      apiCalls++;
      assert.ok(ep.includes('/definitions/2020-09-01/productTypes/SHIRT'));
      return {
        productType: 'SHIRT',
        displayName: 'Shirt',
        schema: {
          type: 'object',
          required: ['item_name', 'brand', 'color'],
          properties: {
            item_name: { type: 'string', minLength: 10 },
            brand: { type: 'string' },
            color: { type: 'string' },
          },
        },
        _metadata: { status: 200, requestId: 'req-schema-1' },
      };
    },
  };

  // First call hits SP-API
  const first = await getProductTypeDefinition(mockClient, 'SHIRT', 'A21TJRUUN4KGV');
  assert.equal(first.schemaSource, 'AMAZON_SP_API');
  assert.equal(first.cached, false);
  assert.equal(apiCalls, 1);

  // Second call serves from TTL cache (zero extra HTTP calls)
  const second = await getProductTypeDefinition(mockClient, 'SHIRT', 'A21TJRUUN4KGV');
  assert.equal(second.cached, true);
  assert.equal(apiCalls, 1, 'Second schema lookup must hit cache without another SP-API request');

  // JSON Schema validation catches missing required field ('color') and short 'item_name'
  const invalidCheck = validatePayloadAgainstProductTypeSchema(
    {
      productType: 'SHIRT',
      attributes: {
        item_name: [{ value: 'Short' }],
        brand: [{ value: 'TestBrand' }],
      },
    },
    first
  );
  assert.equal(invalidCheck.valid, false);
  assert.ok(
    invalidCheck.errors.some((e) => e.attribute === 'color'),
    'JSON Schema validator must flag missing required attribute color'
  );
  assert.ok(
    invalidCheck.warnings.some((w) => w.attribute === 'item_name'),
    'JSON Schema validator must check minLength on item_name'
  );

  // Valid payload passes JSON Schema validation
  const validCheck = validatePayloadAgainstProductTypeSchema(
    {
      productType: 'SHIRT',
      attributes: {
        item_name: [{ value: 'Handcrafted Pure Cotton Casual Shirt White' }],
        brand: [{ value: 'Bhartiye Crafts' }],
        color: [{ value: 'White' }],
      },
    },
    first
  );
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.errors.length, 0);
});

// =========================================================================
// TEST 12: Amazon HTTP 200 with status: 'INVALID' / ERROR issues is REJECTED
// =========================================================================
test('12. Amazon HTTP 200 with status INVALID or ERROR issues is marked REJECTED (never fake success)', async () => {
  clearDefinitionsCache();
  const mockSubmission = {
    _id: 'sub-invalid-200',
    sellerId: '507f1f77bcf86cd799439011',
    sellerSku: 'SKU-INVALID-200',
    productType: 'SHIRT',
    marketplaceId: 'A21TJRUUN4KGV',
    environment: 'sandbox',
    mappedAttributes: {
      title: 'Handcrafted Pure Cotton Casual Shirt',
      brand: 'Bhartiye Crafts',
      sellerSku: 'SKU-INVALID-200',
      description: 'Breathable handloom cotton casual shirt crafted in India for everyday comfort.',
      bulletPoints: ['100% pure cotton', 'Breathable weave'],
      mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
      price: 1299,
      quantity: 10,
      gtinExemptionRequested: true,
    },
    gtinExemptionRequested: true,
    save: async function () { return this; },
  };

  const mockInvalidClient = {
    credentials: { sellingPartnerId: 'A2MERCHANT1', marketplaceId: 'A21TJRUUN4KGV' },
    executeRequest: async (_ep, opts) => {
      if (opts?.method === 'PUT') {
        return {
          sku: 'SKU-INVALID-200',
          status: 'INVALID',
          submissionId: 'amzn-sub-rejected-200',
          issues: [
            {
              code: '90220',
              message: 'Missing required attribute: fabric_type',
              severity: 'ERROR',
              attributeNames: ['fabric_type'],
            },
          ],
          _metadata: { status: 200, requestId: 'req-invalid-200' },
        };
      }
      return {};
    },
  };

  const res = await executeListingSubmission(mockSubmission, {
    client: mockInvalidClient,
    dryRun: false,
    mode: 'SANDBOX_SUBMISSION',
    environment: 'sandbox',
  });

  assert.equal(res.success, false, 'HTTP 200 with status INVALID must return success: false');
  assert.equal(res.status, 'REJECTED');
  assert.equal(res.errorCode, 'AMAZON_LISTING_INVALID');
  assert.equal(res.executionOutcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE);
  assert.equal(mockSubmission.status, 'REJECTED');
  assert.ok(res.issues.some((i) => i.severity === 'ERROR'));
});

// =========================================================================
// TEST 13: Missing Sandbox credentials fail honestly + Master Product immutability + Secret-safe diagnostics
// =========================================================================
test('13. Missing Sandbox credentials fail honestly (no fake DRY_RUN_COMPLETED), preserve master Product, and emit secret-safe diagnostics', async () => {
  clearDefinitionsCache();
  inMemoryChannelsMap.clear();
  const originalConnFindOne = ChannelConnection.findOne;
  const originalProdFindOne = Product.findOne;
  const originalFetch = global.fetch;

  try {
    ChannelConnection.findOne = async () => null;

    const masterProduct = {
      _id: '507f1f77bcf86cd799439055',
      sellerId: '507f1f77bcf86cd799439011',
      title: 'Master Handloom Kurta',
      sku: 'MASTER-KURTA-01',
      masterPrice: 1499,
      costPrice: 800,
      stock: 42,
      description: 'Authentic handloom cotton kurta with detailed embroidery crafted in Jaipur.',
      brand: 'Bhartiye Crafts',
      categoryName: 'Apparel',
      productType: 'SHIRT',
      images: ['https://res.cloudinary.com/demo/image/upload/kurta.jpg'],
      bulletPoints: ['Pure cotton', 'Handloom weave'],
      status: 'Active',
      aiApproved: true,
    };
    Product.findOne = async () => masterProduct;

    const submission = {
      _id: 'sub-missing-creds',
      sellerId: '507f1f77bcf86cd799439011',
      productId: masterProduct._id,
      sellerSku: 'AMZ-KURTA-01',
      productType: 'SHIRT',
      marketplaceId: 'A21TJRUUN4KGV',
      environment: 'sandbox',
      mappedAttributes: {
        title: 'Master Handloom Kurta Pure Cotton',
        brand: 'Bhartiye Crafts',
        sellerSku: 'AMZ-KURTA-01',
        description: 'Authentic handloom cotton kurta with detailed embroidery crafted in Jaipur.',
        bulletPoints: ['Pure cotton', 'Handloom weave'],
        mainImage: 'https://res.cloudinary.com/demo/image/upload/kurta.jpg',
        price: 1699, // channel-specific price
        quantity: 12, // channel-specific stock
        gtinExemptionRequested: true,
      },
      gtinExemptionRequested: true,
      save: async function () { return this; },
    };

    // 13a. SANDBOX_SUBMISSION without credentials must FAIL honestly (NEVER return DRY_RUN_COMPLETED or mock-dry-run-*)
    const missingCredsRes = await executeListingSubmission(submission, {
      dryRun: false,
      mode: 'SANDBOX_SUBMISSION',
      environment: 'sandbox',
    });
    assert.equal(missingCredsRes.success, false);
    assert.equal(missingCredsRes.status, 'FAILED');
    assert.equal(missingCredsRes.errorCode, 'AMAZON_CREDENTIALS_MISSING');
    assert.equal(missingCredsRes.amazonSubmissionId, null);
    assert.equal(missingCredsRes.executionOutcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE);
    assert.notEqual(missingCredsRes.status, 'DRY_RUN_COMPLETED');

    // 13b. Master Product price & stock remain strictly untouched
    assert.equal(masterProduct.masterPrice, 1499, 'Master product price must remain immutable');
    assert.equal(masterProduct.stock, 42, 'Master product stock must remain immutable');

    // 13c. DRY_RUN explicitly returns executionOutcome === 'DRY_RUN'
    const dryRes = await executeListingSubmission(submission, {
      dryRun: true,
      mode: 'DRY_RUN',
      environment: 'sandbox',
    });
    assert.equal(dryRes.success, true);
    assert.equal(dryRes.status, 'DRY_RUN');
    assert.equal(dryRes.executionOutcome, AMAZON_EXECUTION_OUTCOMES.DRY_RUN);

    // 13d. AmazonSpApiClient emits structured secret-safe diagnostics on HTTP calls
    clearLwaTokenCache();
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({
          access_token: 'Atza|SUPER_SECRET_ACCESS_TOKEN',
          expires_in: 3600,
        });
      }
      return createJsonFetchResponse(INDIA_PARTICIPATIONS_PAYLOAD, {
        headers: {
          'x-amzn-requestid': 'req-diag-987',
          'x-amzn-ratelimit-limit': '0.016',
        },
      });
    };

    const diagClient = new AmazonSpApiClient({
      region: 'eu',
      sandbox: true,
      clientId: 'amzn1.client.diag',
      clientSecret: 'SUPER_SECRET_CLIENT_SECRET',
      refreshToken: 'Atzr|SUPER_SECRET_REFRESH_TOKEN',
      sellerId: '507f1f77bcf86cd799439011',
    });
    const diagRes = await diagClient.executeRequest('/sellers/v1/marketplaceParticipations', {
      operation: 'SellersAPI.getMarketplaceParticipations',
    });

    const diag = diagClient.getLastRequestDiagnostics();
    assert.equal(diag.httpStatus, 200);
    assert.equal(diag.endpoint, '/sellers/v1/marketplaceParticipations');
    assert.equal(diag.operation, 'SellersAPI.getMarketplaceParticipations');
    assert.equal(typeof diag.durationMs, 'number');
    assert.equal(diag.requestId, 'req-diag-987');
    assert.equal(diag.outcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS);
    assert.equal(diag.baseUrl, 'https://sandbox.sellingpartnerapi-eu.amazon.com');
    assert.equal(diagRes._metadata.outcome, AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS);

    const serializedDiag = JSON.stringify(diag);
    assert.ok(!serializedDiag.includes('SUPER_SECRET_ACCESS_TOKEN'), 'Diagnostics must never contain access token');
    assert.ok(!serializedDiag.includes('SUPER_SECRET_REFRESH_TOKEN'), 'Diagnostics must never contain refresh token');
    assert.ok(!serializedDiag.includes('SUPER_SECRET_CLIENT_SECRET'), 'Diagnostics must never contain client secret');
  } finally {
    ChannelConnection.findOne = originalConnFindOne;
    Product.findOne = originalProdFindOne;
    global.fetch = originalFetch;
  }
});
