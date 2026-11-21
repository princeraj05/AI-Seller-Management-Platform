import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import {
  INDIA_MARKETPLACE_ID,
  serializeCatalogKeywords,
  searchCatalogItems,
  getCatalogItem,
} from '../src/integrations/marketplaces/amazon/amazon.catalog.service.js';
import { AMAZON_EXECUTION_OUTCOMES } from '../src/integrations/marketplaces/amazon/amazon.client.js';

// =========================================================================
// TEST 1: Keyword serialization follows Catalog Items v2022-04-01 spec
// =========================================================================
test('1. serializeCatalogKeywords produces deduplicated comma-delimited keyword list (max 20)', () => {
  assert.equal(serializeCatalogKeywords('wireless earbuds'), 'wireless,earbuds');
  assert.equal(serializeCatalogKeywords('  wireless,   earbuds , Wireless  '), 'wireless,earbuds');
  assert.equal(serializeCatalogKeywords(''), '');

  const twentyFive = Array.from({ length: 25 }, (_, i) => `word${i + 1}`).join(' ');
  const serialized = serializeCatalogKeywords(twentyFive).split(',');
  assert.equal(serialized.length, 20);
});

// =========================================================================
// TEST 2: Official Catalog Items v2022-04-01 request shape & India marketplace preservation
// =========================================================================
test('2. searchCatalogItems builds spec-compliant v2022-04-01 query targeting India A21TJRUUN4KGV', async () => {
  let calledEndpoint = '';
  let calledOpts = null;

  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({
      httpStatus: 200,
      endpoint: '/catalog/2022-04-01/items',
      operation: 'searchCatalogItems',
      durationMs: 145,
      requestId: 'req-cat-200',
      region: 'eu',
      environment: 'sandbox',
      outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    }),
    executeRequest: async (ep, opts) => {
      calledEndpoint = ep;
      calledOpts = opts;
      return {
        numberOfResults: 1,
        items: [
          {
            asin: 'B08N5WRWNW',
            summaries: [
              {
                marketplaceId: 'A21TJRUUN4KGV',
                itemName: 'Wireless Bluetooth Earbuds',
                brand: 'AudioBrand',
                productType: 'HEADPHONES',
              },
            ],
            images: [
              {
                marketplaceId: 'A21TJRUUN4KGV',
                images: [{ variant: 'MAIN', link: 'https://m.media-amazon.com/images/I/test.jpg' }],
              },
            ],
          },
        ],
      };
    },
  };

  const res = await searchCatalogItems(mockClient, {
    keywords: 'wireless earbuds',
    includedData: ['summaries', 'images', 'INVALID_ENUM_SHOULD_BE_STRIPPED'],
  });

  assert.equal(calledOpts.method, 'GET');
  assert.equal(calledOpts.operation, 'searchCatalogItems');
  const parsed = new URL(`https://sandbox.sellingpartnerapi-eu.amazon.com${calledEndpoint}`);
  assert.equal(parsed.pathname, '/catalog/2022-04-01/items');
  assert.equal(parsed.searchParams.get('marketplaceIds'), 'A21TJRUUN4KGV');
  assert.equal(parsed.searchParams.get('keywords'), 'wireless,earbuds');
  assert.equal(parsed.searchParams.get('includedData'), 'summaries,images');
  assert.equal(parsed.searchParams.get('identifiers'), null);
  assert.equal(parsed.searchParams.get('identifiersType'), null);

  assert.equal(res.marketplaceId, 'A21TJRUUN4KGV');
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].asin, 'B08N5WRWNW');
  assert.equal(res.isEmpty, false);
  assert.equal(res.diagnostics.requestId, 'req-cat-200');
});

// =========================================================================
// TEST 3: Strict parameter validation & mutual exclusivity
// =========================================================================
test('3. searchCatalogItems enforces mutual exclusivity and required identifier dependencies', async () => {
  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    executeRequest: async () => {
      throw new Error('Should not execute HTTP call on invalid params');
    },
  };

  // Empty query
  await assert.rejects(
    () => searchCatalogItems(mockClient, { keywords: '   ' }),
    (err) => err.code === 'INVALID_CATALOG_QUERY' && err.status === 400
  );

  // Mutually exclusive keywords + identifiers
  await assert.rejects(
    () =>
      searchCatalogItems(mockClient, {
        keywords: 'wireless earbuds',
        identifiers: 'B08N5WRWNW',
        identifiersType: 'ASIN',
      }),
    (err) => err.code === 'MUTUALLY_EXCLUSIVE_PARAMS' && err.status === 400
  );

  // Identifiers without valid identifiersType
  await assert.rejects(
    () => searchCatalogItems(mockClient, { identifiers: 'B08N5WRWNW', identifiersType: 'INVALID_TYPE' }),
    (err) => err.code === 'INVALID_IDENTIFIERS_TYPE' && err.status === 400
  );

  // identifiersType=SKU without sellingPartnerId
  await assert.rejects(
    () => searchCatalogItems(mockClient, { identifiers: 'SKU-1', identifiersType: 'SKU' }),
    (err) => err.code === 'SELLER_ID_REQUIRED_FOR_SKU' && err.status === 400
  );
});

// =========================================================================
// TEST 4: Empty catalog response never fabricates fake products
// =========================================================================
test('4. Empty Amazon catalog response returns isEmpty=true and 0 items without synthetic products', async () => {
  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({ httpStatus: 200, requestId: 'req-empty-cat' }),
    executeRequest: async () => ({ numberOfResults: 0, items: [] }),
  };

  const res = await searchCatalogItems(mockClient, { keywords: 'wireless earbuds' });
  assert.equal(res.isEmpty, true);
  assert.equal(res.items.length, 0);
  assert.equal(res.numberOfResults, 0);
  assert.equal(res.marketplaceId, 'A21TJRUUN4KGV');
});

// =========================================================================
// TEST 5: Static Sandbox HTTP 400 "Could not match input arguments" preserved truthfully
// =========================================================================
test('5. Static Sandbox HTTP 400 InvalidInput ("Could not match input arguments") preserves real error + diagnostics', async () => {
  const diag = {
    httpStatus: 400,
    endpoint: '/catalog/2022-04-01/items',
    operation: 'searchCatalogItems',
    durationMs: 512,
    requestId: '8ffbc8f8-cfa5-4fc5-b304-7e07446f36da',
    region: 'eu',
    environment: 'sandbox',
    isSandbox: true,
    baseUrl: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
    outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
  };

  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => diag,
    executeRequest: async () => {
      const e = new Error('Could not match input arguments');
      e.status = 400;
      e.code = 'API_ERROR';
      e.sanitizedData = {
        errors: [{ code: 'InvalidInput', message: 'Could not match input arguments', details: '' }],
      };
      e.diagnostics = diag;
      throw e;
    },
  };

  await assert.rejects(
    () => searchCatalogItems(mockClient, { keywords: 'wireless earbuds' }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'SANDBOX_CATALOG_STATIC_NO_MATCH');
      assert.equal(err.sandboxStaticNoMatch, true);
      assert.equal(err.amazonErrorCode, 'InvalidInput');
      assert.equal(err.amazonErrorMessage, 'Could not match input arguments');
      assert.equal(err.marketplaceId, 'A21TJRUUN4KGV');
      assert.equal(err.diagnostics.requestId, '8ffbc8f8-cfa5-4fc5-b304-7e07446f36da');
      return true;
    }
  );
});

// =========================================================================
// TEST 6: Production HTTP 400 is NEVER classified as Static Sandbox no-match
// =========================================================================
test('6. Production HTTP 400 InvalidInput is NOT classified as SANDBOX_CATALOG_STATIC_NO_MATCH', async () => {
  const mockProdClient = {
    isSandbox: false,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({ httpStatus: 400, environment: 'production', requestId: 'req-prod-400' }),
    executeRequest: async () => {
      const e = new Error('Could not match input arguments');
      e.status = 400;
      e.sanitizedData = {
        errors: [{ code: 'InvalidInput', message: 'Could not match input arguments' }],
      };
      throw e;
    },
  };

  await assert.rejects(
    () => searchCatalogItems(mockProdClient, { keywords: 'wireless earbuds' }),
    (err) => err.status === 400 && err.sandboxStaticNoMatch === false && err.code !== 'SANDBOX_CATALOG_STATIC_NO_MATCH'
  );
});

// =========================================================================
// TEST 7: getCatalogItem validates ASIN and preserves diagnostics
// =========================================================================
test('7. getCatalogItem requires valid ASIN and returns normalized item with diagnostics', async () => {
  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: INDIA_MARKETPLACE_ID },
    getLastRequestDiagnostics: () => ({ httpStatus: 200, requestId: 'req-asin-200' }),
    executeRequest: async (ep, opts) => {
      assert.equal(opts.operation, 'getCatalogItem');
      assert.ok(ep.startsWith('/catalog/2022-04-01/items/B08N5WRWNW?'));
      assert.ok(ep.includes('marketplaceIds=A21TJRUUN4KGV'));
      return {
        asin: 'B08N5WRWNW',
        summaries: [{ marketplaceId: 'A21TJRUUN4KGV', itemName: 'Test Item' }],
      };
    },
  };

  await assert.rejects(
    () => getCatalogItem(mockClient, '   '),
    (err) => err.code === 'INVALID_ASIN' && err.status === 400
  );

  const item = await getCatalogItem(mockClient, 'b08n5wrwnw');
  assert.equal(item.asin, 'B08N5WRWNW');
  assert.equal(item.diagnostics.requestId, 'req-asin-200');
});

// =========================================================================
// TEST 8: Frontend Catalog Discovery UI safety & UX checks
// =========================================================================
test('8. AmazonChannel.jsx prevents duplicate submissions, renders empty state, and displays Static Sandbox diagnostics', () => {
  const jsxPath = path.resolve(process.cwd(), 'frontend/src/pages/marketplaces/AmazonChannel.jsx');
  const src = fs.readFileSync(jsxPath, 'utf8');

  assert.ok(src.includes('if (catalogLoading) return;'), 'Must prevent duplicate catalog submissions');
  assert.ok(src.includes('catalogError.sandboxStaticNoMatch'), 'Must render dedicated Static Sandbox explanation');
  assert.ok(src.includes('No Amazon catalog products returned'), 'Must render explicit empty state');
  assert.ok(src.includes('catalogDiagnostics'), 'Must display secret-safe HTTP/RequestId diagnostics');
});
