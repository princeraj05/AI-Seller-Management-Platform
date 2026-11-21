import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { config } from '../src/config/env.js';
import { ChannelConnection } from '../src/modules/channels/channelConnection.model.js';
import {
  connectAmazonManualService,
  getAmazonConnectionStatusService,
  testAmazonConnectionService,
  disconnectAmazonService,
  inMemoryChannelsMap,
} from '../src/modules/channels/channel.service.js';
import { clearLwaTokenCache } from '../src/integrations/marketplaces/amazon/amazon.auth.js';
import {
  INDIA_MARKETPLACE_ID,
  AMAZON_VERIFICATION_MODES,
  SANDBOX_STATIC_MOCK_MESSAGE,
  detectStaticSandboxMockParticipations,
  parseMarketplaceParticipationsResponse,
  verifyAmazonSellerAuthorization,
} from '../src/integrations/marketplaces/amazon/amazon.sellers.service.js';
import { executeListingSubmission } from '../src/integrations/marketplaces/amazon/amazon.publisher.service.js';
import { decryptCredentials } from '../src/utils/encryption.js';

mongoose.set('bufferCommands', false);

const createJsonFetchResponse = (payload, { ok = true, status = 200, headers = {} } = {}) => ({
  ok,
  status,
  headers: new Headers(headers),
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

// Official Amazon sellers.json x-amzn-api-sandbox.static mock response
const OFFICIAL_STATIC_SANDBOX_US_MOCK = {
  payload: [
    {
      marketplace: {
        id: 'ATVPDKIKX0DER',
        name: 'Amazon.com',
        countryCode: 'US',
        defaultCurrencyCode: 'USD',
        defaultLanguageCode: 'en_US',
        domainName: 'www.amazon.com',
      },
      participation: {
        isParticipating: true,
        hasSuspendedListings: false,
      },
      storeName: 'Example Store Name',
    },
  ],
};

// Genuine India marketplace participation response
const GENUINE_INDIA_PARTICIPATION = {
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
      storeName: 'Verified India Sandbox Merchant',
    },
  ],
};

// =========================================================================
// TEST 1: Successful LWA exchange + known Static Sandbox mock response
// =========================================================================
test('1. LWA success + known Static Sandbox US mock marks SANDBOX_TRANSPORT_VERIFIED without false seller/India auth', async () => {
  clearLwaTokenCache();
  inMemoryChannelsMap.clear();
  const originalFetch = global.fetch;
  const originalFindOne = ChannelConnection.findOne;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-2b1';
    config.amazon.clientSecret = 'sandbox-secret-2b1';

    let savedDoc = null;
    ChannelConnection.findOneAndUpdate = async (_filter, update) => {
      savedDoc = {
        _id: 'conn-2b1-static-mock',
        ...(update.$set || update),
        save: async function () {
          return this;
        },
      };
      return savedDoc;
    };

    let lwaCalls = 0;
    global.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('api.amazon.com/auth/o2/token')) {
        lwaCalls++;
        return createJsonFetchResponse({
          access_token: `Atza|sandbox-access-${lwaCalls}`,
          expires_in: 3600,
        });
      }
      if (urlStr.includes('/sellers/v1/marketplaceParticipations')) {
        assert.ok(
          urlStr.startsWith('https://sandbox.sellingpartnerapi-eu.amazon.com/sellers/v1/marketplaceParticipations'),
          'Must target EU Sandbox endpoint'
        );
        return createJsonFetchResponse(OFFICIAL_STATIC_SANDBOX_US_MOCK, {
          headers: { 'x-amzn-RequestId': 'req-static-mock-001' },
        });
      }
      throw new Error(`Unexpected URL: ${urlStr}`);
    };

    const tenant = { sellerId: '507f1f77bcf86cd799439101', storeId: '507f1f77bcf86cd799439201' };
    const conn = await connectAmazonManualService(tenant, {
      refreshToken: 'Atzr|sandbox-dev-central-token',
      sellingPartnerId: '',
      marketplaceId: INDIA_MARKETPLACE_ID,
      marketplaceRegion: 'eu',
      displayName: 'Amazon India Store (Sandbox)',
    });

    assert.equal(conn.status, 'SANDBOX_TRANSPORT_VERIFIED');
    assert.equal(conn.environment, 'sandbox');
    assert.equal(conn.marketplaceId, 'A21TJRUUN4KGV', 'Must keep India marketplaceId, never switch to US');
    assert.equal(conn.marketplaceRegion, 'eu', 'Must keep eu region');
    assert.equal(conn.lwaVerified, true);
    assert.equal(conn.sandboxTransportVerified, true);
    assert.equal(conn.sellerAuthorizationVerified, false);
    assert.equal(conn.indiaMarketplaceAuthorized, false);
    assert.equal(conn.verificationMode, AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK);
    assert.ok(conn.lastVerifiedAt, 'lastVerifiedAt must be populated');
    assert.equal(conn.authorizedAt, null, 'authorizedAt must stay null when seller auth is not verified');
    assert.equal(conn.metadata.statusMessage, SANDBOX_STATIC_MOCK_MESSAGE);
    assert.deepEqual(conn.metadata.authorizedMarketplaceIds, []);
    assert.deepEqual(conn.metadata.observedMarketplaceIds, ['ATVPDKIKX0DER']);
    assert.equal(conn.metadata.lastDiagnostics.httpStatus, 200);
    assert.equal(conn.metadata.lastDiagnostics.requestId, 'req-static-mock-001');
    assert.equal(conn.metadata.lastDiagnostics.endpoint, '/sellers/v1/marketplaceParticipations');
    assert.equal(conn.metadata.lastDiagnostics.environment, 'sandbox');

    // Status endpoint reports connected: false and exposes all 6 verification flags
    ChannelConnection.findOne = async () => savedDoc;
    const status = await getAmazonConnectionStatusService(tenant);
    assert.equal(status.connected, false, 'SANDBOX_TRANSPORT_VERIFIED must NOT report connected: true');
    assert.equal(status.status, 'SANDBOX_TRANSPORT_VERIFIED');
    assert.equal(status.lwaVerified, true);
    assert.equal(status.sandboxTransportVerified, true);
    assert.equal(status.sellerAuthorizationVerified, false);
    assert.equal(status.indiaMarketplaceAuthorized, false);
    assert.equal(status.verificationMode, 'SANDBOX_STATIC_MOCK');
    assert.ok(status.lastVerifiedAt);

    // Test Connection remains functional and performs fresh LWA + Sandbox HTTP call
    const lwaBeforeTest = lwaCalls;
    const testRes = await testAmazonConnectionService(tenant);
    assert.ok(lwaCalls > lwaBeforeTest, 'Test Connection must perform fresh cache-bypassing LWA exchange');
    assert.equal(testRes.success, true);
    assert.equal(testRes.status, 'SANDBOX_TRANSPORT_VERIFIED');
    assert.equal(testRes.lwaVerified, true);
    assert.equal(testRes.sandboxTransportVerified, true);
    assert.equal(testRes.sellerAuthorizationVerified, false);
    assert.equal(testRes.indiaMarketplaceAuthorized, false);
    assert.equal(testRes.verificationMode, 'SANDBOX_STATIC_MOCK');
    assert.equal(testRes.message, SANDBOX_STATIC_MOCK_MESSAGE);
    assert.equal(testRes.diagnostics.requestId, 'req-static-mock-001');
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOne = originalFindOne;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 2: Successful LWA exchange + genuine Sandbox India response
// =========================================================================
test('2. LWA success + genuine India participation response marks CONNECTED with REAL_SELLER_AUTHORIZED', async () => {
  clearLwaTokenCache();
  inMemoryChannelsMap.clear();
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-2b1';
    config.amazon.clientSecret = 'sandbox-secret-2b1';

    ChannelConnection.findOneAndUpdate = async (_filter, update) => ({
      _id: 'conn-2b1-genuine',
      ...(update.$set || update),
    });

    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({ access_token: 'Atza|genuine-ok', expires_in: 3600 });
      }
      return createJsonFetchResponse(GENUINE_INDIA_PARTICIPATION, {
        headers: { 'x-amzn-RequestId': 'req-genuine-in-001' },
      });
    };

    const conn = await connectAmazonManualService(
      { sellerId: '507f1f77bcf86cd799439102', storeId: null },
      {
        refreshToken: 'Atzr|genuine-india-token',
        sellingPartnerId: 'A2GENUINEINDIA1',
        marketplaceId: INDIA_MARKETPLACE_ID,
        marketplaceRegion: 'eu',
      }
    );

    assert.equal(conn.status, 'CONNECTED');
    assert.equal(conn.lwaVerified, true);
    assert.equal(conn.sandboxTransportVerified, true);
    assert.equal(conn.sellerAuthorizationVerified, true);
    assert.equal(conn.indiaMarketplaceAuthorized, true);
    assert.equal(conn.verificationMode, AMAZON_VERIFICATION_MODES.REAL_SELLER_AUTHORIZED);
    assert.ok(conn.authorizedAt);
    assert.equal(conn.sellingPartnerId, 'A2GENUINEINDIA1');
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 3: LWA failure
// =========================================================================
test('3. LWA failure rejects manual connect before Sellers API and marks REAUTH_REQUIRED on Test Connection', async () => {
  clearLwaTokenCache();
  const originalFetch = global.fetch;
  const originalFindOne = ChannelConnection.findOne;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-2b1';
    config.amazon.clientSecret = 'sandbox-secret-2b1';

    let saved = false;
    ChannelConnection.findOneAndUpdate = async () => {
      saved = true;
      return {};
    };

    let sellersCalled = false;
    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse(
          { error: 'invalid_grant', error_description: 'The refresh token is invalid.' },
          { ok: false, status: 401 }
        );
      }
      sellersCalled = true;
      throw new Error('Should not reach Sellers API on LWA failure');
    };

    await assert.rejects(
      () =>
        connectAmazonManualService(
          { sellerId: '507f1f77bcf86cd799439103' },
          { refreshToken: 'Atzr|bad-token', marketplaceId: INDIA_MARKETPLACE_ID, marketplaceRegion: 'eu' }
        ),
      (err) => err.status === 401
    );
    assert.equal(saved, false);
    assert.equal(sellersCalled, false);
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOne = originalFindOne;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 4: Sandbox HTTP failure
// =========================================================================
test('4. Sandbox Sellers API HTTP 403/500 failure rejects connection and reports FAILED verificationMode', async () => {
  clearLwaTokenCache();
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-2b1';
    config.amazon.clientSecret = 'sandbox-secret-2b1';

    let saved = false;
    ChannelConnection.findOneAndUpdate = async () => {
      saved = true;
      return {};
    };

    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({ access_token: 'Atza|ok-lwa', expires_in: 3600 });
      }
      return createJsonFetchResponse(
        { errors: [{ code: 'Unauthorized', message: 'Access to requested resource is denied.' }] },
        { ok: false, status: 403, headers: { 'x-amzn-RequestId': 'req-403-fail' } }
      );
    };

    await assert.rejects(
      () =>
        connectAmazonManualService(
          { sellerId: '507f1f77bcf86cd799439104' },
          { refreshToken: 'Atzr|valid-lwa-403', marketplaceId: INDIA_MARKETPLACE_ID, marketplaceRegion: 'eu' }
        ),
      (err) =>
        err.code === 'SP_API_FORBIDDEN' &&
        err.status === 403 &&
        err.verificationMode === AMAZON_VERIFICATION_MODES.FAILED
    );
    assert.equal(saved, false);
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 5: Unknown / unrecognized marketplace response (NEVER silently classified as mock)
// =========================================================================
test('5. Unrecognized marketplace response is NOT silently classified as static mock and reports UNKNOWN', async () => {
  // 5a. UK-only participation response
  const ukClient = {
    environment: 'sandbox',
    isSandbox: true,
    executeRequest: async () => ({
      payload: [
        {
          marketplace: {
            id: 'A1F83G8C2ARO7P',
            name: 'Amazon.co.uk',
            countryCode: 'GB',
            defaultCurrencyCode: 'GBP',
            defaultLanguageCode: 'en_GB',
            domainName: 'www.amazon.co.uk',
          },
          participation: { isParticipating: true, hasSuspendedListings: false },
        },
      ],
      _metadata: { status: 200, requestId: 'req-uk-only' },
    }),
  };

  const ukRes = await verifyAmazonSellerAuthorization(ukClient, {
    expectedMarketplaceId: INDIA_MARKETPLACE_ID,
    environment: 'sandbox',
  });
  assert.equal(ukRes.verified, false);
  assert.equal(ukRes.sandboxTransportVerified, false);
  assert.equal(ukRes.verificationMode, AMAZON_VERIFICATION_MODES.UNKNOWN);
  assert.equal(ukRes.code, 'MARKETPLACE_NOT_AUTHORIZED');
  assert.deepEqual(ukRes.observedMarketplaceIds, ['A1F83G8C2ARO7P']);

  // 5b. US response with a real custom storeName is NOT misclassified as static mock
  const customUsParsed = parseMarketplaceParticipationsResponse({
    payload: [
      {
        marketplace: {
          id: 'ATVPDKIKX0DER',
          name: 'Amazon.com',
          countryCode: 'US',
          defaultCurrencyCode: 'USD',
          defaultLanguageCode: 'en_US',
          domainName: 'www.amazon.com',
        },
        participation: { isParticipating: true, hasSuspendedListings: false },
        storeName: 'Acme Genuine US LLC',
      },
    ],
  });
  const mockCheck = detectStaticSandboxMockParticipations(customUsParsed, {
    environment: 'sandbox',
    expectedMarketplaceId: INDIA_MARKETPLACE_ID,
  });
  assert.equal(mockCheck.isStaticMock, false, 'Custom US storeName must not be silently classified as static mock');
});

// =========================================================================
// TEST 6: Production NEVER accepts Sandbox mock verification
// =========================================================================
test('6. Production strictly rejects static US mock response and never accepts SANDBOX_STATIC_MOCK', async () => {
  const parsedMock = parseMarketplaceParticipationsResponse(OFFICIAL_STATIC_SANDBOX_US_MOCK);
  const prodDetect = detectStaticSandboxMockParticipations(parsedMock, {
    environment: 'production',
    expectedMarketplaceId: INDIA_MARKETPLACE_ID,
  });
  assert.equal(prodDetect.isStaticMock, false, 'Production detector must always return isStaticMock: false');

  const prodClient = {
    environment: 'production',
    isSandbox: false,
    executeRequest: async () => ({
      ...OFFICIAL_STATIC_SANDBOX_US_MOCK,
      _metadata: { status: 200, requestId: 'req-prod-mock' },
    }),
  };

  const prodRes = await verifyAmazonSellerAuthorization(prodClient, {
    expectedMarketplaceId: INDIA_MARKETPLACE_ID,
    environment: 'production',
  });
  assert.equal(prodRes.verified, false);
  assert.equal(prodRes.sandboxTransportVerified, false);
  assert.equal(prodRes.sellerAuthorizationVerified, false);
  assert.equal(prodRes.indiaMarketplaceAuthorized, false);
  assert.equal(prodRes.verificationMode, AMAZON_VERIFICATION_MODES.FAILED);
  assert.equal(prodRes.code, 'MARKETPLACE_NOT_AUTHORIZED');
});

// =========================================================================
// TEST 7: Empty sellingPartnerId allowed for transport-only Sandbox testing, never fabricated
// =========================================================================
test('7. Empty sellingPartnerId is allowed for transport-only Sandbox connect and blocked on Listings PUT', async () => {
  clearLwaTokenCache();
  const originalFetch = global.fetch;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-2b1';
    config.amazon.clientSecret = 'sandbox-secret-2b1';

    let storedEncrypted = null;
    ChannelConnection.findOneAndUpdate = async (_filter, update) => {
      const payload = update.$set || update;
      storedEncrypted = payload.credentials;
      return { _id: 'conn-2b1-empty-spid', ...payload };
    };

    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({ access_token: 'Atza|transport-only', expires_in: 3600 });
      }
      return createJsonFetchResponse(OFFICIAL_STATIC_SANDBOX_US_MOCK, {
        headers: { 'x-amzn-RequestId': 'req-empty-spid' },
      });
    };

    const conn = await connectAmazonManualService(
      { sellerId: '507f1f77bcf86cd799439107' },
      { refreshToken: 'Atzr|transport-only-token', marketplaceId: INDIA_MARKETPLACE_ID, marketplaceRegion: 'eu' }
    );
    assert.equal(conn.status, 'SANDBOX_TRANSPORT_VERIFIED');
    assert.equal(conn.sellingPartnerId, '', 'Must NOT fabricate a fake sellingPartnerId');

    const dec = decryptCredentials(storedEncrypted);
    assert.equal(dec.refreshToken, 'Atzr|transport-only-token');
    assert.equal(dec.sellingPartnerId, '');

    // Listing submission rejects mock/empty sellingPartnerId
    const mockSub = {
      _id: 'sub-2b1-mock-spid',
      sellerId: '507f1f77bcf86cd799439107',
      sellerSku: 'SKU-2B1-001',
      productType: 'SHIRT',
      marketplaceId: INDIA_MARKETPLACE_ID,
      environment: 'sandbox',
      mappedAttributes: {
        title: 'Handloom Cotton Shirt India',
        brand: 'Bhartiye Crafts',
        sellerSku: 'SKU-2B1-001',
        description: 'Pure handloom cotton shirt crafted in India for daily comfort.',
        bulletPoints: ['Pure cotton', 'Breathable weave'],
        mainImage: 'https://res.cloudinary.com/demo/image/upload/shirt.jpg',
        price: 999,
        quantity: 5,
        gtinExemptionRequested: true,
      },
      gtinExemptionRequested: true,
      save: async function () {
        return this;
      },
    };

    const pubRes = await executeListingSubmission(mockSub, {
      client: {
        credentials: { sellingPartnerId: 'MOCK_SANDBOX_SELLER', marketplaceId: INDIA_MARKETPLACE_ID },
        executeRequest: async () => {
          throw new Error('Must never call PUT with mock sellingPartnerId');
        },
      },
      dryRun: false,
      mode: 'SANDBOX_SUBMISSION',
      environment: 'sandbox',
    });
    assert.equal(pubRes.success, false);
    assert.equal(pubRes.errorCode, 'MISSING_SELLING_PARTNER_ID');
    assert.equal(pubRes.amazonSubmissionId, null);
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});

// =========================================================================
// TEST 8: UI never claims real seller authorization or Connected & Active for SANDBOX_STATIC_MOCK
// =========================================================================
test('8. AmazonChannel.jsx displays exact Sandbox transport notice and never shows Connected & Active for static mock', () => {
  const jsxPath = path.resolve(process.cwd(), 'frontend/src/pages/marketplaces/AmazonChannel.jsx');
  const src = fs.readFileSync(jsxPath, 'utf8');

  assert.ok(
    src.includes(SANDBOX_STATIC_MOCK_MESSAGE),
    'UI must include exact required Sandbox static mock notice'
  );
  assert.ok(
    src.includes("connection?.status === 'SANDBOX_TRANSPORT_VERIFIED'"),
    'UI must explicitly branch on SANDBOX_TRANSPORT_VERIFIED'
  );
  assert.ok(
    src.includes("connection.status === 'CONNECTED'") && src.includes('connection.sellerAuthorizationVerified !== false'),
    'UI isConnected must require CONNECTED and sellerAuthorizationVerified !== false'
  );
  assert.ok(
    src.includes('Sandbox Transport Verified (Static Mock)'),
    'UI must render distinct Sandbox Transport Verified badge'
  );
});

// =========================================================================
// TEST 9: Tenant isolation & disconnect behavior with SANDBOX_TRANSPORT_VERIFIED
// =========================================================================
test('9. Tenant isolation and disconnect reset all 6 verification flags and prevent cross-tenant access', async () => {
  clearLwaTokenCache();
  inMemoryChannelsMap.clear();
  const originalFetch = global.fetch;
  const originalFindOne = ChannelConnection.findOne;
  const originalFindOneAndUpdate = ChannelConnection.findOneAndUpdate;
  const originalClientId = config.amazon.clientId;
  const originalClientSecret = config.amazon.clientSecret;

  try {
    config.amazon.clientId = 'amzn1.application-oa2-client.sandbox-2b1';
    config.amazon.clientSecret = 'sandbox-secret-2b1';

    const tenantA = { sellerId: '507f1f77bcf86cd799439111', storeId: '507f1f77bcf86cd799439211' };
    const tenantB = { sellerId: '507f1f77bcf86cd799439999', storeId: '507f1f77bcf86cd799439998' };

    let savedDocA = null;
    ChannelConnection.findOneAndUpdate = async (_filter, update) => {
      savedDocA = {
        _id: 'conn-tenant-a-2b1',
        ...(update.$set || update),
        save: async function () {
          return this;
        },
      };
      return savedDocA;
    };

    global.fetch = async (url) => {
      if (String(url).includes('api.amazon.com/auth/o2/token')) {
        return createJsonFetchResponse({ access_token: 'Atza|tenant-a-token', expires_in: 3600 });
      }
      return createJsonFetchResponse(OFFICIAL_STATIC_SANDBOX_US_MOCK, {
        headers: { 'x-amzn-RequestId': 'req-tenant-a' },
      });
    };

    await connectAmazonManualService(tenantA, {
      refreshToken: 'Atzr|tenant-a-secret',
      marketplaceId: INDIA_MARKETPLACE_ID,
      marketplaceRegion: 'eu',
    });

    // Tenant B must NOT see Tenant A's SANDBOX_TRANSPORT_VERIFIED connection
    ChannelConnection.findOne = async () => null;
    const statusB = await getAmazonConnectionStatusService(tenantB);
    assert.equal(statusB.status, 'NOT_CONFIGURED');
    assert.equal(statusB.sandboxTransportVerified, false);
    assert.equal(statusB.lwaVerified, false);

    // Tenant A disconnect clears credentials and resets all 6 verification flags
    ChannelConnection.findOne = async () => savedDocA;
    const disc = await disconnectAmazonService(tenantA);
    assert.equal(disc.status, 'DISCONNECTED');
    assert.equal(savedDocA.credentials, null);
    assert.equal(savedDocA.lwaVerified, false);
    assert.equal(savedDocA.sandboxTransportVerified, false);
    assert.equal(savedDocA.sellerAuthorizationVerified, false);
    assert.equal(savedDocA.indiaMarketplaceAuthorized, false);
    assert.equal(savedDocA.verificationMode, null);
    assert.equal(savedDocA.lastVerifiedAt, null);
  } finally {
    global.fetch = originalFetch;
    ChannelConnection.findOne = originalFindOne;
    ChannelConnection.findOneAndUpdate = originalFindOneAndUpdate;
    config.amazon.clientId = originalClientId;
    config.amazon.clientSecret = originalClientSecret;
  }
});
