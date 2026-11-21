import test from 'node:test';
import assert from 'node:assert/strict';

import {
  searchAmazonOrders,
  getAmazonOrder,
} from '../src/integrations/marketplaces/amazon/amazon.order.service.js';
import {
  mapAmazonFinancialEventsToRefunds,
  mapAmazonOrderToDbPayload,
} from '../src/integrations/marketplaces/amazon/amazon.order.mapper.js';
import {
  searchListingsItems,
  getListingsItem,
  LISTINGS_PAGE_SIZE_MIN,
  LISTINGS_PAGE_SIZE_MAX,
} from '../src/integrations/marketplaces/amazon/amazon.listings.service.js';
import {
  getItemOffers,
  getListingOffers,
} from '../src/integrations/marketplaces/amazon/amazon.pricing.service.js';
import {
  AmazonSpApiClient,
  AMAZON_EXECUTION_OUTCOMES,
} from '../src/integrations/marketplaces/amazon/amazon.client.js';

// =========================================================================
// TEST 1: Exact Orders API v2026-01-01 query parameter serialization
// =========================================================================
test('1. Orders API v2026-01-01 serializes official fulfillmentStatuses, fulfilledBy, maxResultsPerPage, paginationToken', async () => {
  let capturedUrl = '';
  let capturedOpts = null;

  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    getLastRequestDiagnostics: () => ({
      httpStatus: 200,
      endpoint: '/orders/2026-01-01/orders',
      operation: 'searchOrders',
      durationMs: 120,
      requestId: 'req-ord-200',
      region: 'eu',
      environment: 'sandbox',
      outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    }),
    executeRequest: async (ep, opts) => {
      capturedUrl = ep;
      capturedOpts = opts;
      return {
        orders: [{ orderId: '402-1111111-2222222' }],
        pagination: { nextToken: 'tok-page-2' },
      };
    },
  };

  // Supports legacy aliases (orderStatuses, fulfillmentChannels AFN/MFN, pageSize, pageToken) and emits official v2026-01-01 wire names
  const res = await searchAmazonOrders(mockClient, {
    marketplaceId: 'A21TJRUUN4KGV',
    createdAfter: '2026-11-01T00:00:00Z',
    createdBefore: '2026-11-20T00:00:00Z',
    orderStatuses: ['UNSHIPPED', 'PARTIALLY_SHIPPED'],
    fulfillmentChannels: ['AFN', 'MFN'],
    includedData: ['PROCEEDS', 'FULFILLMENT', 'PACKAGES'],
    pageSize: 25,
    pageToken: 'tok-page-1',
  });

  assert.equal(capturedOpts.method, 'GET');
  assert.equal(capturedOpts.operation, 'searchOrders');

  const parsed = new URL(`https://sandbox.sellingpartnerapi-eu.amazon.com${capturedUrl}`);
  assert.equal(parsed.pathname, '/orders/2026-01-01/orders');
  assert.equal(parsed.searchParams.get('marketplaceIds'), 'A21TJRUUN4KGV');
  assert.equal(parsed.searchParams.get('fulfillmentStatuses'), 'UNSHIPPED,PARTIALLY_SHIPPED');
  assert.equal(parsed.searchParams.get('fulfilledBy'), 'AMAZON,MERCHANT');
  assert.equal(parsed.searchParams.get('maxResultsPerPage'), '25');
  assert.equal(parsed.searchParams.get('paginationToken'), 'tok-page-1');
  assert.equal(parsed.searchParams.get('createdAfter'), '2026-11-01T00:00:00.000Z');
  assert.equal(parsed.searchParams.get('createdBefore'), '2026-11-20T00:00:00.000Z');
  assert.equal(parsed.searchParams.get('includedData'), 'PROCEEDS,FULFILLMENT,PACKAGES');

  // Legacy mismatched parameter names must NEVER appear on the wire
  assert.equal(parsed.searchParams.get('orderStatuses'), null);
  assert.equal(parsed.searchParams.get('fulfillmentChannels'), null);
  assert.equal(parsed.searchParams.get('pageSize'), null);
  assert.equal(parsed.searchParams.get('pageToken'), null);

  assert.equal(res.pagination.nextToken, 'tok-page-2');
  assert.equal(res.diagnostics.requestId, 'req-ord-200');

  // Mutual exclusivity: lastUpdatedAfter omits createdAfter/createdBefore
  await searchAmazonOrders(mockClient, {
    lastUpdatedAfter: '2026-11-10T00:00:00Z',
    createdAfter: '2026-11-01T00:00:00Z',
    fulfillmentStatuses: ['SHIPPED'],
    fulfilledBy: ['MERCHANT'],
    maxResultsPerPage: 100,
  });
  const parsed2 = new URL(`https://sandbox.sellingpartnerapi-eu.amazon.com${capturedUrl}`);
  assert.equal(parsed2.searchParams.get('lastUpdatedAfter'), '2026-11-10T00:00:00.000Z');
  assert.equal(parsed2.searchParams.get('createdAfter'), null);
  assert.equal(parsed2.searchParams.get('fulfilledBy'), 'MERCHANT');
  assert.equal(parsed2.searchParams.get('maxResultsPerPage'), '100');

  // Rejects invalid maxResultsPerPage & invalid enum values
  await assert.rejects(
    () => searchAmazonOrders(mockClient, { maxResultsPerPage: 101 }),
    (err) => err.code === 'INVALID_MAX_RESULTS_PER_PAGE' && err.status === 400
  );
  await assert.rejects(
    () => searchAmazonOrders(mockClient, { maxResultsPerPage: 0 }),
    (err) => err.code === 'INVALID_MAX_RESULTS_PER_PAGE' && err.status === 400
  );
  await assert.rejects(
    () => searchAmazonOrders(mockClient, { fulfilledBy: ['INVALID_PARTY'] }),
    (err) => err.code === 'INVALID_FULFILLED_BY' && err.status === 400
  );
  await assert.rejects(
    () => searchAmazonOrders(mockClient, { fulfillmentStatuses: ['BOGUS_STATUS'] }),
    (err) => err.code === 'INVALID_FULFILLMENT_STATUS' && err.status === 400
  );
});

// =========================================================================
// TEST 2: Orders HTTP 400/404 are NOT silently swallowed; return structured diagnostics
// =========================================================================
test('2. Orders searchAmazonOrders & getAmazonOrder do not silently swallow HTTP 400/404 and emit diagnostics', async () => {
  const diag400 = {
    httpStatus: 400,
    endpoint: '/orders/2026-01-01/orders',
    operation: 'searchOrders',
    durationMs: 245,
    requestId: 'req-ord-400',
    region: 'eu',
    environment: 'sandbox',
    outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
  };

  const client400 = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    getLastRequestDiagnostics: () => diag400,
    executeRequest: async () => {
      const e = new Error('Could not match input arguments');
      e.status = 400;
      e.sanitizedData = { errors: [{ code: 'InvalidInput', message: 'Could not match input arguments' }] };
      e.diagnostics = diag400;
      throw e;
    },
  };

  await assert.rejects(
    () => searchAmazonOrders(client400, { createdAfter: '2026-11-01T00:00:00Z' }),
    (err) =>
      err.status === 400 &&
      err.amazonErrorCode === 'InvalidInput' &&
      err.marketplaceId === 'A21TJRUUN4KGV' &&
      err.diagnostics?.requestId === 'req-ord-400'
  );

  const client404 = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    getLastRequestDiagnostics: () => ({ httpStatus: 404, requestId: 'req-ord-404' }),
    executeRequest: async () => {
      const e = new Error('Order not found');
      e.status = 404;
      throw e;
    },
  };

  await assert.rejects(
    () => searchAmazonOrders(client404, {}),
    (err) => err.status === 404 && err.diagnostics?.requestId === 'req-ord-404'
  );

  await assert.rejects(
    () => getAmazonOrder(client404, '402-0000000-0000000'),
    (err) => err.status === 404 && err.diagnostics?.requestId === 'req-ord-404'
  );
});

// =========================================================================
// TEST 3: Listings searchListingsItems pageSize boundary values (1, 20, 21, 0)
// =========================================================================
test('3. Listings searchListingsItems enforces official pageSize bounds (1 and 20 valid; 0 and 21 rejected)', async () => {
  assert.equal(LISTINGS_PAGE_SIZE_MIN, 1);
  assert.equal(LISTINGS_PAGE_SIZE_MAX, 20);

  const calledUrls = [];
  const mockClient = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    getLastRequestDiagnostics: () => ({ httpStatus: 200, requestId: 'req-lst-200' }),
    executeRequest: async (ep) => {
      calledUrls.push(ep);
      return {
        items: [],
        pagination: { nextToken: 'next-lst-tok', previousToken: 'prev-lst-tok' },
      };
    },
  };

  // pageSize = 1 -> valid
  const res1 = await searchListingsItems(mockClient, 'A1378QQCGW63C', { pageSize: 1, pageToken: 'p1' });
  assert.ok(calledUrls[0].includes('pageSize=1'));
  assert.ok(calledUrls[0].includes('pageToken=p1'));
  assert.equal(res1.pagination.nextToken, 'next-lst-tok');
  assert.equal(res1.pagination.previousToken, 'prev-lst-tok');
  assert.equal(res1.marketplaceId, 'A21TJRUUN4KGV');

  // pageSize = 20 -> valid (maximum)
  await searchListingsItems(mockClient, 'A1378QQCGW63C', { pageSize: 20 });
  assert.ok(calledUrls[1].includes('pageSize=20'));

  // pageSize = 21 -> rejected (exceeds official max 20)
  await assert.rejects(
    () => searchListingsItems(mockClient, 'A1378QQCGW63C', { pageSize: 21 }),
    (err) => err.code === 'INVALID_PAGE_SIZE' && err.status === 400
  );

  // pageSize = 0 -> rejected (below min 1)
  await assert.rejects(
    () => searchListingsItems(mockClient, 'A1378QQCGW63C', { pageSize: 0 }),
    (err) => err.code === 'INVALID_PAGE_SIZE' && err.status === 400
  );
});

// =========================================================================
// TEST 4: Listings HTTP 400/404 diagnostics (never silently swallowed)
// =========================================================================
test('4. Listings searchListingsItems and getListingsItem throw structured diagnostics on HTTP 400/404', async () => {
  const client400 = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    getLastRequestDiagnostics: () => ({
      httpStatus: 400,
      endpoint: '/listings/2021-08-01/items/A1378QQCGW63C',
      operation: 'searchListingsItems',
      durationMs: 180,
      requestId: 'req-lst-400',
      region: 'eu',
      environment: 'sandbox',
    }),
    executeRequest: async () => {
      const e = new Error('Could not match input arguments');
      e.status = 400;
      e.sanitizedData = { errors: [{ code: 'InvalidInput', message: 'Could not match input arguments' }] };
      throw e;
    },
  };

  await assert.rejects(
    () => searchListingsItems(client400, 'A1378QQCGW63C', { pageSize: 10 }),
    (err) =>
      err.status === 400 &&
      err.code === 'LISTINGS_BAD_REQUEST' &&
      err.amazonErrorCode === 'InvalidInput' &&
      err.diagnostics?.requestId === 'req-lst-400' &&
      err.marketplaceId === 'A21TJRUUN4KGV'
  );

  const client404 = {
    isSandbox: true,
    region: 'eu',
    credentials: { marketplaceId: 'A21TJRUUN4KGV' },
    getLastRequestDiagnostics: () => ({ httpStatus: 404, requestId: 'req-lst-404' }),
    executeRequest: async () => {
      const e = new Error('SKU not found');
      e.status = 404;
      throw e;
    },
  };

  await assert.rejects(
    () => searchListingsItems(client404, 'A1378QQCGW63C'),
    (err) => err.status === 404 && err.code === 'LISTING_NOT_FOUND' && err.diagnostics?.requestId === 'req-lst-404'
  );

  await assert.rejects(
    () => getListingsItem(client404, 'A1378QQCGW63C', 'BAD-SKU'),
    (err) => err.status === 404 && err.code === 'LISTING_NOT_FOUND' && err.diagnostics?.requestId === 'req-lst-404'
  );
});

// =========================================================================
// TEST 5: Finances multi-page NextToken retrieval & refund != physical return
// =========================================================================
test('5. Finances getOrderFinancialEvents paginates all NextToken pages, merges events, and never equates refund with physical return', async () => {
  const client = new AmazonSpApiClient({
    region: 'eu',
    sandbox: true,
    clientId: 'amzn1.test',
    clientSecret: 'SUPER_SECRET_CLIENT_SECRET',
    refreshToken: 'Atzr|SUPER_SECRET_REFRESH_TOKEN',
    sellerId: 'tenant-fin-1',
  });

  const calledPaths = [];
  let callNum = 0;
  client.executeRequest = async (ep, opts) => {
    assert.equal(opts.method, 'GET');
    assert.equal(opts.operation, 'listFinancialEventsByOrderId');
    calledPaths.push(ep);
    callNum++;
    client.lastDiagnostics = {
      httpStatus: 200,
      endpoint: ep.split('?')[0],
      operation: 'listFinancialEventsByOrderId',
      durationMs: 90 + callNum,
      requestId: `req-fin-page-${callNum}`,
      region: 'eu',
      environment: 'sandbox',
      outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };

    if (callNum === 1) {
      return {
        payload: {
          NextToken: 'fin-token-page-2',
          FinancialEvents: {
            RefundEventList: [
              {
                PostedDate: '2026-11-10T10:00:00Z',
                ShipmentItemAdjustmentList: [
                  {
                    SellerSKU: 'SKU-IN-1',
                    QuantityShipped: 1,
                    ItemChargeAdjustmentList: [{ ChargeAmount: { CurrencyCode: 'INR', CurrencyAmount: -500 } }],
                  },
                ],
              },
            ],
          },
        },
      };
    }
    if (callNum === 2) {
      return {
        payload: {
          NextToken: 'fin-token-page-3',
          FinancialEvents: {
            RefundEventList: [
              {
                PostedDate: '2026-11-11T10:00:00Z',
                ShipmentItemAdjustmentList: [
                  {
                    SellerSKU: 'SKU-IN-2',
                    QuantityShipped: 1,
                    ItemChargeAdjustmentList: [{ ChargeAmount: { CurrencyCode: 'INR', CurrencyAmount: -250 } }],
                  },
                ],
              },
            ],
          },
        },
      };
    }
    return {
      payload: {
        FinancialEvents: {
          ShipmentEventList: [{ AmazonOrderId: '402-5555555-6666666' }],
        },
      },
    };
  };

  const events = await client.getOrderFinancialEvents('402-5555555-6666666');

  assert.equal(calledPaths.length, 3);
  assert.ok(calledPaths[0].includes('MaxResultsPerPage=100'));
  assert.ok(!calledPaths[0].includes('NextToken='));
  assert.ok(calledPaths[1].includes('NextToken=fin-token-page-2'));
  assert.ok(calledPaths[2].includes('NextToken=fin-token-page-3'));

  assert.equal(events.RefundEventList.length, 2, 'RefundEventList must merge across pages');
  assert.equal(events.ShipmentEventList.length, 1);
  assert.equal(events._diagnostics.pagesFetched, 3);
  assert.equal(events._diagnostics.hasMorePages, false);
  assert.equal(events._diagnostics.truncatedReason, null);
  assert.equal(events._diagnostics.refundDoesNotImplyPhysicalReturn, true);

  // Verify refund mapper sums merged events accurately
  const refundSummary = mapAmazonFinancialEventsToRefunds(events);
  assert.equal(refundSummary.refundAmount, 750);
  assert.equal(refundSummary.refundCount, 2);

  // Verify a financial refund alone does NOT mark physical returnDetails.isReturned = true
  const dbOrder = mapAmazonOrderToDbPayload(
    {
      orderId: '402-5555555-6666666',
      orderStatus: 'SHIPPED',
      orderTotal: { amount: 1500, currencyCode: 'INR' },
      orderItems: [],
    },
    {
      sellerId: 'tenant-fin-1',
      channelId: 'ch-1',
      marketplaceId: 'A21TJRUUN4KGV',
      financialEvents: events,
    }
  );
  assert.equal(dbOrder.refundAmount, 750);
  assert.equal(dbOrder.refundStatus, 'PARTIAL');
  assert.equal(
    dbOrder.returnDetails.isReturned,
    false,
    'A financial refund event MUST NOT be interpreted as proof of a physical return'
  );
});

// =========================================================================
// TEST 6: Finances repeated-token protection & maxPages cap (no infinite loop)
// =========================================================================
test('6. Finances getOrderFinancialEvents halts immediately on repeated NextToken and enforces maxPages', async () => {
  const client = new AmazonSpApiClient({
    region: 'eu',
    sandbox: true,
    refreshToken: 'Atzr|test',
    sellerId: 'tenant-fin-loop',
  });

  let attempts = 0;
  client.executeRequest = async () => {
    attempts++;
    client.lastDiagnostics = { httpStatus: 200, requestId: `req-loop-${attempts}` };
    return {
      payload: {
        NextToken: 'STUCK_SAME_TOKEN',
        FinancialEvents: { RefundEventList: [{ PostedDate: '2026-11-10T00:00:00Z' }] },
      },
    };
  };

  const res = await client.getOrderFinancialEvents('402-9999999-1111111', { maxPages: 10 });
  assert.equal(attempts, 2, 'Must stop on second encounter of identical NextToken');
  assert.equal(res._diagnostics.truncatedReason, 'REPEATED_NEXT_TOKEN');
  assert.equal(res._diagnostics.hasMorePages, true);

  // Also test maxPages cap with unique tokens
  let uniqueAttempts = 0;
  client.executeRequest = async () => {
    uniqueAttempts++;
    client.lastDiagnostics = { httpStatus: 200, requestId: `req-cap-${uniqueAttempts}` };
    return {
      payload: {
        NextToken: `UNIQUE_TOKEN_${uniqueAttempts}`,
        FinancialEvents: { RefundEventList: [] },
      },
    };
  };

  const capped = await client.getOrderFinancialEvents('402-9999999-2222222', { maxPages: 3 });
  assert.equal(uniqueAttempts, 3);
  assert.equal(capped._diagnostics.truncatedReason, 'MAX_PAGES_REACHED');
});

// =========================================================================
// TEST 7: Pricing API v0 structured error handling, INR preservation & secret redaction
// =========================================================================
test('7. Pricing API v0 preserves India/INR mapping, emits structured error diagnostics, and never leaks secrets', async () => {
  let calledEndpoint = '';
  const okClient = {
    isSandbox: true,
    region: 'eu',
    credentials: {
      marketplaceId: 'A21TJRUUN4KGV',
      clientSecret: 'SUPER_SECRET_PRICING_KEY',
      refreshToken: 'Atzr|SUPER_SECRET_PRICING_TOKEN',
    },
    getLastRequestDiagnostics: () => ({
      httpStatus: 200,
      endpoint: '/products/pricing/v0/items/B08N5WRWNW/offers',
      operation: 'getItemOffers',
      durationMs: 140,
      requestId: 'req-price-200',
      region: 'eu',
      environment: 'sandbox',
      outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    }),
    executeRequest: async (ep, opts) => {
      calledEndpoint = ep;
      assert.equal(opts.method, 'GET');
      assert.equal(opts.operation, 'getItemOffers');
      return {
        payload: {
          ASIN: 'B08N5WRWNW',
          Summary: {
            TotalOfferCount: 3,
            BuyBoxPrices: [
              {
                condition: 'new',
                ListingPrice: { Amount: 1499, CurrencyCode: 'INR' },
                LandedPrice: { Amount: 1499, CurrencyCode: 'INR' },
              },
            ],
            LowestPrices: [
              {
                condition: 'new',
                ListingPrice: { Amount: 1399, CurrencyCode: 'INR' },
                LandedPrice: { Amount: 1399, CurrencyCode: 'INR' },
              },
            ],
          },
          Offers: [],
        },
      };
    },
  };

  const priced = await getItemOffers(okClient, 'B08N5WRWNW');
  assert.ok(calledEndpoint.includes('MarketplaceId=A21TJRUUN4KGV'));
  assert.ok(calledEndpoint.includes('ItemCondition=New'));
  assert.equal(priced.currency, 'INR');
  assert.equal(priced.buyBoxPrice, 1499);
  assert.equal(priced.diagnostics.requestId, 'req-price-200');

  // HTTP 403 region mismatch on getListingOffers
  const err403Client = {
    isSandbox: true,
    region: 'eu',
    credentials: {
      marketplaceId: 'A21TJRUUN4KGV',
      clientSecret: 'SUPER_SECRET_PRICING_KEY',
      refreshToken: 'Atzr|SUPER_SECRET_PRICING_TOKEN',
    },
    getLastRequestDiagnostics: () => ({
      httpStatus: 403,
      endpoint: '/products/pricing/v0/listings/SKU-1/offers',
      operation: 'getListingOffers',
      durationMs: 210,
      requestId: 'req-price-403',
      region: 'eu',
      environment: 'sandbox',
      outcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
    }),
    executeRequest: async () => {
      const e = new Error('Access to requested resource is denied.');
      e.status = 403;
      e.sanitizedData = {
        errors: [
          {
            code: 'Unauthorized',
            message: 'Access to requested resource is denied.',
            details: 'The marketplaces you provided are not valid for region.',
          },
        ],
      };
      throw e;
    },
  };

  let caughtPricingErr = null;
  try {
    await getListingOffers(err403Client, 'SKU-1');
  } catch (e) {
    caughtPricingErr = e;
  }
  assert.ok(caughtPricingErr);
  assert.equal(caughtPricingErr.status, 403);
  assert.equal(caughtPricingErr.code, 'MARKETPLACE_REGION_MISMATCH');
  assert.equal(caughtPricingErr.marketplaceId, 'A21TJRUUN4KGV');
  assert.equal(caughtPricingErr.diagnostics.requestId, 'req-price-403');

  // Verify zero secret leakage in error diagnostics
  const serializedErr = JSON.stringify({
    message: caughtPricingErr.message,
    code: caughtPricingErr.code,
    diagnostics: caughtPricingErr.diagnostics,
  });
  assert.ok(!serializedErr.includes('SUPER_SECRET_PRICING_KEY'));
  assert.ok(!serializedErr.includes('SUPER_SECRET_PRICING_TOKEN'));
});
