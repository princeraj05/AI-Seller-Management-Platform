import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INDIA_MARKETPLACE_ID,
  CATALOG_SANDBOX_COMPATIBILITY,
  checkCatalogSandboxFixtureCompatibility,
  searchCatalogItems,
  getCatalogItem,
} from '../src/integrations/marketplaces/amazon/amazon.catalog.service.js';
import { AMAZON_EXECUTION_OUTCOMES } from '../src/integrations/marketplaces/amazon/amazon.client.js';

// =========================================================================
// TEST 1: Official catalogItems_2022-04-01.json fixture metadata audit
// =========================================================================
test('1. CATALOG_SANDBOX_COMPATIBILITY accurately reflects official catalogItems_2022-04-01.json (no India/EU fixtures)', () => {
  assert.equal(CATALOG_SANDBOX_COMPATIBILITY.apiVersion, '2022-04-01');
  assert.equal(CATALOG_SANDBOX_COMPATIBILITY.indiaMarketplaceId, 'A21TJRUUN4KGV');
  assert.equal(CATALOG_SANDBOX_COMPATIBILITY.hasIndiaFixture, false);
  assert.equal(CATALOG_SANDBOX_COMPATIBILITY.hasEuRegionFixture, false);
  assert.equal(CATALOG_SANDBOX_COMPATIBILITY.documentedOfficialFixtures.length, 2);

  const [searchFixture, getFixture] = CATALOG_SANDBOX_COMPATIBILITY.documentedOfficialFixtures;
  assert.equal(searchFixture.operationId, 'searchCatalogItems');
  assert.equal(searchFixture.region, 'na');
  assert.deepEqual(searchFixture.marketplaceIds, ['ATVPDKIKX0DER']);
  assert.deepEqual(searchFixture.keywords, ['samsung', 'tv']);
  assert.equal(searchFixture.returnedAsin, 'B07N4M94X4');

  assert.equal(getFixture.operationId, 'getCatalogItem');
  assert.equal(getFixture.region, 'na');
  assert.deepEqual(getFixture.marketplaceIds, ['ATVPDKIKX0DER']);
  assert.equal(getFixture.asin, 'B07N4M94X4');
});

// =========================================================================
// TEST 2: Deterministic fixture compatibility checker
// =========================================================================
test('2. checkCatalogSandboxFixtureCompatibility distinguishes NA fixtures, missing India/EU fixtures, and region mismatch', () => {
  // Documented NA keyword fixture
  const naSearchOk = checkCatalogSandboxFixtureCompatibility({
    operationId: 'searchCatalogItems',
    region: 'na',
    marketplaceId: 'ATVPDKIKX0DER',
    keywords: 'samsung tv',
  });
  assert.equal(naSearchOk.supportedInStaticSandbox, true);
  assert.equal(naSearchOk.reason, 'MATCHES_DOCUMENTED_NA_FIXTURE');
  assert.equal(naSearchOk.matchedFixture.returnedAsin, 'B07N4M94X4');

  // Documented NA ASIN fixture
  const naAsinOk = checkCatalogSandboxFixtureCompatibility({
    operationId: 'getCatalogItem',
    region: 'na',
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'b07n4m94x4',
  });
  assert.equal(naAsinOk.supportedInStaticSandbox, true);
  assert.equal(naAsinOk.reason, 'MATCHES_DOCUMENTED_NA_FIXTURE');

  // India marketplace on EU Sandbox — NO fixture exists
  const indiaEu = checkCatalogSandboxFixtureCompatibility({
    operationId: 'searchCatalogItems',
    region: 'eu',
    marketplaceId: INDIA_MARKETPLACE_ID,
    keywords: 'samsung tv',
  });
  assert.equal(indiaEu.supportedInStaticSandbox, false);
  assert.equal(indiaEu.reason, 'NO_STATIC_FIXTURE_FOR_MARKETPLACE');
  assert.equal(indiaEu.hasIndiaFixture, false);
  assert.equal(indiaEu.hasEuRegionFixture, false);

  // US marketplace on EU Sandbox — Region mismatch
  const usOnEu = checkCatalogSandboxFixtureCompatibility({
    operationId: 'searchCatalogItems',
    region: 'eu',
    marketplaceId: 'ATVPDKIKX0DER',
    keywords: 'samsung tv',
  });
  assert.equal(usOnEu.supportedInStaticSandbox, false);
  assert.equal(usOnEu.reason, 'MARKETPLACE_REGION_MISMATCH');

  // Arbitrary keywords on NA Sandbox
  const naUnmatched = checkCatalogSandboxFixtureCompatibility({
    operationId: 'searchCatalogItems',
    region: 'na',
    marketplaceId: 'ATVPDKIKX0DER',
    keywords: 'wireless earbuds',
  });
  assert.equal(naUnmatched.supportedInStaticSandbox, false);
  assert.equal(naUnmatched.reason, 'UNMATCHED_SANDBOX_KEYWORDS');
});

// =========================================================================
// TEST 3: Unsupported EU Sandbox queries preserve India marketplace and classify as UNSUPPORTED_SANDBOX_QUERY
// =========================================================================
test('3. Unsupported EU Sandbox queries classify as UNSUPPORTED_SANDBOX_QUERY while preserving India A21TJRUUN4KGV', async () => {
  let calledUrl = '';
  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({
      httpStatus: 400,
      endpoint: '/catalog/2022-04-01/items',
      operation: 'searchCatalogItems',
      durationMs: 310,
      requestId: 'req-eu-nomatch-1',
      region: 'eu',
      environment: 'sandbox',
      outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
    }),
    executeRequest: async (ep, opts) => {
      calledUrl = ep;
      assert.equal(opts.method, 'GET', 'Catalog search must remain strictly read-only GET');
      const e = new Error('Could not match input arguments');
      e.status = 400;
      e.sanitizedData = {
        errors: [{ code: 'InvalidInput', message: 'Could not match input arguments', details: '' }],
      };
      throw e;
    },
  };

  await assert.rejects(
    () => searchCatalogItems(mockClient, { keywords: 'samsung tv' }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'SANDBOX_CATALOG_STATIC_NO_MATCH');
      assert.equal(err.errorCategory, 'UNSUPPORTED_SANDBOX_QUERY');
      assert.equal(err.sandboxStaticNoMatch, true);
      assert.equal(err.marketplaceId, 'A21TJRUUN4KGV');
      assert.deepEqual(err.sandboxCompatibility, { hasIndiaFixture: false, hasEuRegionFixture: false });
      return true;
    }
  );

  assert.ok(calledUrl.includes('marketplaceIds=A21TJRUUN4KGV'), 'Must preserve India marketplaceId, never switch to US');
  assert.ok(!calledUrl.includes('ATVPDKIKX0DER'), 'Must never substitute US marketplace ID');
});

// =========================================================================
// TEST 4: Distinct classification of actual API failures vs unsupported Sandbox queries
// =========================================================================
test('4. Region mismatch (403), auth failure (401), forbidden (403), rate limit (429), and network errors classify as API_FAILURE', async () => {
  const makeErrorClient = (errObj) => ({
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({ httpStatus: errObj.status || null, requestId: 'req-err' }),
    executeRequest: async () => {
      throw errObj;
    },
  });

  // 4a. HTTP 403 Region mismatch (exact EU Sandbox error when passing ATVPDKIKX0DER)
  const regionErr = new Error('Access to requested resource is denied.');
  regionErr.status = 403;
  regionErr.sanitizedData = {
    errors: [
      {
        code: 'Unauthorized',
        message: 'Access to requested resource is denied.',
        details: 'The marketplaces you provided are not valid for region.',
      },
    ],
  };
  await assert.rejects(
    () => searchCatalogItems(makeErrorClient(regionErr), { keywords: 'samsung tv', marketplaceIds: 'ATVPDKIKX0DER' }),
    (err) =>
      err.code === 'MARKETPLACE_REGION_MISMATCH' &&
      err.errorCategory === 'API_FAILURE' &&
      err.sandboxStaticNoMatch === false &&
      err.amazonErrorDetails.includes('not valid for region')
  );

  // 4b. HTTP 401 Unauthorized
  const err401 = new Error('Unauthorized');
  err401.status = 401;
  await assert.rejects(
    () => searchCatalogItems(makeErrorClient(err401), { keywords: 'wireless earbuds' }),
    (err) => err.code === 'LWA_UNAUTHORIZED' && err.errorCategory === 'API_FAILURE' && err.sandboxStaticNoMatch === false
  );

  // 4c. HTTP 403 Generic Forbidden (not region mismatch)
  const err403 = new Error('Access denied');
  err403.status = 403;
  await assert.rejects(
    () => searchCatalogItems(makeErrorClient(err403), { keywords: 'wireless earbuds' }),
    (err) => err.code === 'SP_API_FORBIDDEN' && err.errorCategory === 'API_FAILURE'
  );

  // 4d. HTTP 429 Rate Limited
  const err429 = new Error('QuotaExceeded');
  err429.status = 429;
  await assert.rejects(
    () => searchCatalogItems(makeErrorClient(err429), { keywords: 'wireless earbuds' }),
    (err) => err.code === 'RATE_LIMITED' && err.errorCategory === 'API_FAILURE'
  );

  // 4e. Network failure
  const netErr = new Error('fetch failed: ECONNREFUSED');
  await assert.rejects(
    () => searchCatalogItems(makeErrorClient(netErr), { keywords: 'wireless earbuds' }),
    (err) => err.code === 'NETWORK_FAILURE' && err.status === 502 && err.errorCategory === 'API_FAILURE'
  );
});

// =========================================================================
// TEST 5: getCatalogItem preserves India marketplace and read-only GET
// =========================================================================
test('5. getCatalogItem preserves India A21TJRUUN4KGV and classifies EU Sandbox 400 as UNSUPPORTED_SANDBOX_QUERY', async () => {
  let calledPath = '';
  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({ httpStatus: 400, requestId: 'req-asin-400' }),
    executeRequest: async (ep, opts) => {
      calledPath = ep;
      assert.equal(opts.method, 'GET');
      const e = new Error('Could not match input arguments');
      e.status = 400;
      e.sanitizedData = {
        errors: [{ code: 'InvalidInput', message: 'Could not match input arguments', details: '' }],
      };
      throw e;
    },
  };

  await assert.rejects(
    () => getCatalogItem(mockClient, 'B07N4M94X4'),
    (err) =>
      err.code === 'SANDBOX_CATALOG_STATIC_NO_MATCH' &&
      err.errorCategory === 'UNSUPPORTED_SANDBOX_QUERY' &&
      err.marketplaceId === 'A21TJRUUN4KGV'
  );

  assert.ok(calledPath.includes('marketplaceIds=A21TJRUUN4KGV'));
  assert.ok(!calledPath.includes('ATVPDKIKX0DER'));
});
