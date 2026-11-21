/**
 * Amazon SP-API Sellers API v1 Service
 *
 * Official endpoint: GET /sellers/v1/marketplaceParticipations
 * Strictly read-only.
 *
 * Phase 2B.1: Safely distinguishes between:
 *  - REAL_SELLER_AUTHORIZED: genuine expected marketplace authorization (e.g., India A21TJRUUN4KGV)
 *  - SANDBOX_STATIC_MOCK: conservative detection of Amazon's documented Static Sandbox US mock
 *    (ATVPDKIKX0DER) when environment === 'sandbox'. Verifies LWA + Sandbox HTTP transport ONLY;
 *    NEVER claims real seller authorization or India marketplace enrollment.
 *  - UNKNOWN / FAILED: unrecognized marketplace responses or errors (never silently downgraded to mock).
 *  - Production NEVER accepts SANDBOX_STATIC_MOCK under any circumstance.
 */
import { AMAZON_EXECUTION_OUTCOMES } from './amazon.client.js';

export const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';
export const US_STATIC_SANDBOX_MARKETPLACE_ID = 'ATVPDKIKX0DER';

export const AMAZON_VERIFICATION_MODES = Object.freeze({
  REAL_SELLER_AUTHORIZED: 'REAL_SELLER_AUTHORIZED',
  SANDBOX_STATIC_MOCK: 'SANDBOX_STATIC_MOCK',
  UNKNOWN: 'UNKNOWN',
  FAILED: 'FAILED',
});

export const SANDBOX_STATIC_MOCK_MESSAGE =
  'Sandbox API connection verified. Real seller authorization and India marketplace enrollment have not been verified.';

const KNOWN_STATIC_SANDBOX_STORE_NAMES = new Set([
  '',
  'example store name',
  'bestsellerstore',
  'best seller store',
  'my store',
  'test store',
]);

/**
 * Parse official SP-API GET /sellers/v1/marketplaceParticipations response payload
 *
 * Official response shape:
 * {
 *   payload: [
 *     {
 *       marketplace: {
 *         id: "A21TJRUUN4KGV",
 *         name: "Amazon.in",
 *         countryCode: "IN",
 *         defaultCurrencyCode: "INR",
 *         defaultLanguageCode: "en_IN",
 *         domainName: "www.amazon.in"
 *       },
 *       participation: {
 *         isParticipating: true,
 *         hasSuspendedListings: false
 *       },
 *       storeName?: "..."
 *     }
 *   ]
 * }
 *
 * @param {Object|Array} responseData
 * @returns {{
 *   participations: Array<Object>,
 *   authorizedMarketplaceIds: string[],
 *   hasIndiaMarketplace: boolean,
 *   indiaParticipation: Object|null,
 *   sellingPartnerId: string|null
 * }}
 */
export const parseMarketplaceParticipationsResponse = (responseData) => {
  const rawList = Array.isArray(responseData)
    ? responseData
    : Array.isArray(responseData?.payload)
    ? responseData.payload
    : Array.isArray(responseData?.marketplaceParticipations)
    ? responseData.marketplaceParticipations
    : [];

  const participations = [];
  let detectedSellingPartnerId =
    responseData?.sellingPartnerId || responseData?.payload?.sellingPartnerId || null;

  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;
    const mp = entry.marketplace || entry;
    const part = entry.participation || {};
    const marketplaceId = mp.id || mp.marketplaceId || null;
    if (!marketplaceId) continue;

    if (!detectedSellingPartnerId && (entry.sellingPartnerId || mp.sellingPartnerId)) {
      detectedSellingPartnerId = entry.sellingPartnerId || mp.sellingPartnerId;
    }

    const isParticipating = part.isParticipating !== undefined ? Boolean(part.isParticipating) : true;
    const hasSuspendedListings = Boolean(part.hasSuspendedListings);

    participations.push({
      marketplaceId: String(marketplaceId).trim(),
      name: mp.name || '',
      countryCode: mp.countryCode || '',
      defaultCurrencyCode: mp.defaultCurrencyCode || '',
      defaultLanguageCode: mp.defaultLanguageCode || '',
      domainName: mp.domainName || '',
      isParticipating,
      hasSuspendedListings,
      storeName: entry.storeName || mp.storeName || null,
    });
  }

  const authorizedMarketplaceIds = Array.from(
    new Set(
      participations
        .filter((p) => p.isParticipating)
        .map((p) => p.marketplaceId)
    )
  );

  const indiaParticipation =
    participations.find((p) => p.marketplaceId === INDIA_MARKETPLACE_ID && p.isParticipating) || null;

  return {
    participations,
    authorizedMarketplaceIds,
    hasIndiaMarketplace: Boolean(indiaParticipation),
    indiaParticipation,
    sellingPartnerId: detectedSellingPartnerId ? String(detectedSellingPartnerId).trim() : null,
  };
};

/**
 * Conservatively detect Amazon's documented Static Sandbox mock payload for
 * GET /sellers/v1/marketplaceParticipations (defined in official sellers.json x-amzn-api-sandbox.static).
 *
 * Rules:
 * - NEVER returns true when environment !== 'sandbox' (Production never accepts static mock).
 * - Requires exact single-entry match against Amazon's documented ATVPDKIKX0DER US mock signature.
 * - Unrecognized, multi-marketplace, non-US, or partial/custom payloads return isStaticMock: false
 *   so they are never silently treated as a mock.
 *
 * @param {{ participations: Array<Object> }} parsed
 * @param {{ environment?: string, expectedMarketplaceId?: string }} [options]
 * @returns {{ isStaticMock: boolean, reason: string|null }}
 */
export const detectStaticSandboxMockParticipations = (parsed, options = {}) => {
  const environment = String(options.environment || 'sandbox').toLowerCase().trim();
  if (environment !== 'sandbox') {
    return { isStaticMock: false, reason: 'NON_SANDBOX_ENVIRONMENT' };
  }

  const expectedMarketplaceId = String(options.expectedMarketplaceId || INDIA_MARKETPLACE_ID).trim();
  const list = Array.isArray(parsed?.participations) ? parsed.participations : [];

  // Official Amazon static sandbox payload contains exactly 1 US marketplace entry
  if (list.length !== 1) {
    return { isStaticMock: false, reason: 'PARTICIPATION_COUNT_MISMATCH' };
  }

  const entry = list[0];
  if (!entry || typeof entry !== 'object') {
    return { isStaticMock: false, reason: 'INVALID_ENTRY' };
  }

  const isExactUsStaticMockFields =
    entry.marketplaceId === US_STATIC_SANDBOX_MARKETPLACE_ID &&
    String(entry.name || '').trim() === 'Amazon.com' &&
    String(entry.countryCode || '').trim().toUpperCase() === 'US' &&
    String(entry.defaultCurrencyCode || '').trim().toUpperCase() === 'USD' &&
    String(entry.defaultLanguageCode || '').trim() === 'en_US' &&
    String(entry.domainName || '').trim().toLowerCase() === 'www.amazon.com' &&
    entry.isParticipating === true &&
    entry.hasSuspendedListings === false;

  if (!isExactUsStaticMockFields) {
    return { isStaticMock: false, reason: 'FIELDS_DO_NOT_MATCH_STATIC_MOCK' };
  }

  const normalizedStoreName = String(entry.storeName || '').trim().toLowerCase();
  if (!KNOWN_STATIC_SANDBOX_STORE_NAMES.has(normalizedStoreName)) {
    return { isStaticMock: false, reason: 'UNRECOGNIZED_STORE_NAME' };
  }

  // Only classify as static mock when targeting a non-US marketplace (e.g., India A21TJRUUN4KGV)
  // OR explicitly in Sandbox where Amazon's static sandbox returns this hardcoded US fixture.
  return {
    isStaticMock: true,
    reason:
      expectedMarketplaceId !== US_STATIC_SANDBOX_MARKETPLACE_ID
        ? 'STATIC_SANDBOX_US_MOCK_FOR_NON_US_TARGET'
        : 'STATIC_SANDBOX_US_MOCK',
  };
};

/**
 * Call GET /sellers/v1/marketplaceParticipations using a tenant-scoped AmazonSpApiClient
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {Object} [options]
 * @param {boolean} [options.bypassCache=false]
 * @returns {Promise<Object>}
 */
export const getMarketplaceParticipations = async (client, options = {}) => {
  if (!client || typeof client.executeRequest !== 'function') {
    const err = new Error('Authenticated Amazon SP-API client is required to query marketplace participations.');
    err.code = 'MISSING_SP_API_CLIENT';
    err.status = 400;
    throw err;
  }

  const endpointPath = '/sellers/v1/marketplaceParticipations';

  try {
    const responseData = await client.executeRequest(endpointPath, {
      method: 'GET',
      operation: 'getMarketplaceParticipations',
      bypassCache: options.bypassCache === true,
    });

    const parsed = parseMarketplaceParticipationsResponse(responseData);
    const diagnostics =
      typeof client.getLastRequestDiagnostics === 'function'
        ? client.getLastRequestDiagnostics()
        : responseData?._metadata || null;

    return {
      success: true,
      ...parsed,
      diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    const status = error.status || null;
    const diagnostics =
      error.diagnostics ||
      (typeof client.getLastRequestDiagnostics === 'function' ? client.getLastRequestDiagnostics() : null);

    let code = error.code || 'SELLERS_API_ERROR';
    let message = error.message || 'Failed to verify Amazon seller marketplace participations.';

    const NETWORK_ERROR_CODES = new Set([
      'NETWORK_FAILURE',
      'NETWORK_ERROR',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'FETCH_FAILED',
    ]);

    if (status === 401 || code === 'UNAUTHORIZED' || code === 'LWA_EXCHANGE_FAILED') {
      code = 'LWA_UNAUTHORIZED';
      message = 'Amazon LWA authorization failed or refresh token was revoked (HTTP 401). Please reauthorize.';
    } else if (status === 403 || code === 'FORBIDDEN') {
      code = 'SP_API_FORBIDDEN';
      message = 'Amazon SP-API denied access to Sellers API marketplaceParticipations (HTTP 403). Verify app roles and seller authorization.';
    } else if (status === 429 || code === 'RATE_LIMITED') {
      code = 'RATE_LIMITED';
      message = 'Amazon SP-API rate limit exceeded while checking marketplace participations (HTTP 429).';
    } else if (NETWORK_ERROR_CODES.has(code) || (!status && /fetch failed|network|econn|enotfound|etimedout/i.test(message))) {
      code = 'NETWORK_FAILURE';
      message = `Unable to reach Amazon SP-API Sellers endpoint: ${error.message}`;
    }

    const wrapped = new Error(message);
    wrapped.code = code;
    wrapped.status = status || (code === 'NETWORK_FAILURE' ? 502 : 500);
    wrapped.requestId = error.requestId || diagnostics?.requestId || null;
    wrapped.diagnostics = diagnostics;
    wrapped.executionOutcome = AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE;
    throw wrapped;
  }
};

/**
 * Verify seller authorization and marketplace participation (default India A21TJRUUN4KGV).
 *
 * Phase 2B.1 behavior:
 * - Resolves explicit environment ('sandbox' | 'production').
 * - When environment === 'sandbox' AND response conservatively matches Amazon's documented
 *   Static Sandbox US mock (ATVPDKIKX0DER):
 *     - lwaVerified = true
 *     - sandboxTransportVerified = true
 *     - sellerAuthorizationVerified = false
 *     - indiaMarketplaceAuthorized = false
 *     - verificationMode = 'SANDBOX_STATIC_MOCK'
 *     - verified = false (NOT real seller authorization)
 *     - transportVerified = true
 *     - Keeps expected marketplaceId (e.g., A21TJRUUN4KGV) untouched.
 * - When environment === 'production':
 *     - NEVER accepts SANDBOX_STATIC_MOCK. Strict real marketplace authorization required.
 * - Unrecognized marketplace responses are NEVER silently classified as mock:
 *     - verificationMode = 'UNKNOWN' (in sandbox) or 'FAILED' (in production), preserving observed response.
 *
 * @param {import('./amazon.client.js').AmazonSpApiClient} client
 * @param {Object} [options]
 * @param {string} [options.expectedMarketplaceId='A21TJRUUN4KGV']
 * @param {string} [options.sellingPartnerId='']
 * @param {string} [options.environment]
 * @param {boolean} [options.bypassCache=true]
 * @param {boolean} [options.lwaVerified=true]
 */
export const verifyAmazonSellerAuthorization = async (client, options = {}) => {
  const expectedMarketplaceId = (options.expectedMarketplaceId || INDIA_MARKETPLACE_ID).trim();
  const suppliedSellingPartnerId = options.sellingPartnerId ? String(options.sellingPartnerId).trim() : '';
  const resolvedEnv = (
    options.environment ||
    (client?.isSandbox === false ? 'production' : client?.environment) ||
    'sandbox'
  )
    .toLowerCase()
    .trim();
  const isSandbox = resolvedEnv !== 'production';
  const verifiedAt = new Date().toISOString();

  try {
    const result = await getMarketplaceParticipations(client, {
      bypassCache: options.bypassCache !== false,
    });

    if (!result.authorizedMarketplaceIds || result.authorizedMarketplaceIds.length === 0) {
      return {
        verified: false,
        transportVerified: false,
        lwaVerified: true,
        sandboxTransportVerified: false,
        sellerAuthorizationVerified: false,
        indiaMarketplaceAuthorized: false,
        verificationMode: AMAZON_VERIFICATION_MODES.FAILED,
        lastVerifiedAt: verifiedAt,
        code: 'EMPTY_MARKETPLACE_PARTICIPATIONS',
        status: 422,
        message: 'Amazon Sellers API returned zero authorized marketplace participations for this seller.',
        sellingPartnerId: result.sellingPartnerId || suppliedSellingPartnerId || null,
        marketplaceId: expectedMarketplaceId,
        authorizedMarketplaceIds: [],
        observedMarketplaceIds: [],
        hasIndiaMarketplace: false,
        participations: result.participations || [],
        diagnostics: result.diagnostics,
        executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      };
    }

    // Check for conservative Static Sandbox mock FIRST in sandbox mode so we NEVER
    // misinterpret Amazon's hardcoded US mock (ATVPDKIKX0DER) as real seller authorization
    // even if expectedMarketplaceId were ATVPDKIKX0DER.
    if (isSandbox) {
      const mockCheck = detectStaticSandboxMockParticipations(result, {
        environment: 'sandbox',
        expectedMarketplaceId,
      });

      if (mockCheck.isStaticMock) {
        return {
          verified: false,
          transportVerified: true,
          lwaVerified: true,
          sandboxTransportVerified: true,
          sellerAuthorizationVerified: false,
          indiaMarketplaceAuthorized: false,
          verificationMode: AMAZON_VERIFICATION_MODES.SANDBOX_STATIC_MOCK,
          lastVerifiedAt: verifiedAt,
          code: 'SANDBOX_STATIC_MOCK',
          status: 200,
          message: SANDBOX_STATIC_MOCK_MESSAGE,
          // Never fabricate a seller identity from a static mock response
          sellingPartnerId: suppliedSellingPartnerId || null,
          marketplaceId: expectedMarketplaceId,
          // Authorized marketplaces remain empty because static mock does NOT prove real authorization
          authorizedMarketplaceIds: [],
          observedMarketplaceIds: result.authorizedMarketplaceIds,
          hasIndiaMarketplace: false,
          participations: result.participations,
          mockDetectionReason: mockCheck.reason,
          diagnostics: result.diagnostics,
          executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
        };
      }
    }

    const expectedAuthorized = result.authorizedMarketplaceIds.includes(expectedMarketplaceId);
    if (!expectedAuthorized) {
      return {
        verified: false,
        transportVerified: false,
        lwaVerified: true,
        sandboxTransportVerified: false,
        sellerAuthorizationVerified: false,
        indiaMarketplaceAuthorized: false,
        verificationMode: isSandbox
          ? AMAZON_VERIFICATION_MODES.UNKNOWN
          : AMAZON_VERIFICATION_MODES.FAILED,
        lastVerifiedAt: verifiedAt,
        code: 'MARKETPLACE_NOT_AUTHORIZED',
        status: 403,
        message: `Seller is not authorized for required marketplace ${expectedMarketplaceId}${
          expectedMarketplaceId === INDIA_MARKETPLACE_ID ? ' (India)' : ''
        }. Observed marketplaces: ${result.authorizedMarketplaceIds.join(', ')}.`,
        sellingPartnerId: result.sellingPartnerId || suppliedSellingPartnerId || null,
        marketplaceId: expectedMarketplaceId,
        authorizedMarketplaceIds: result.authorizedMarketplaceIds,
        observedMarketplaceIds: result.authorizedMarketplaceIds,
        hasIndiaMarketplace: result.hasIndiaMarketplace,
        participations: result.participations,
        diagnostics: result.diagnostics,
        executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
      };
    }

    return {
      verified: true,
      transportVerified: true,
      lwaVerified: true,
      sandboxTransportVerified: isSandbox,
      sellerAuthorizationVerified: true,
      indiaMarketplaceAuthorized: result.hasIndiaMarketplace,
      verificationMode: AMAZON_VERIFICATION_MODES.REAL_SELLER_AUTHORIZED,
      lastVerifiedAt: verifiedAt,
      code: 'SELLER_VERIFIED',
      status: 200,
      message: `Amazon seller authorization verified for marketplace ${expectedMarketplaceId}.`,
      sellingPartnerId: result.sellingPartnerId || suppliedSellingPartnerId || null,
      marketplaceId: expectedMarketplaceId,
      authorizedMarketplaceIds: result.authorizedMarketplaceIds,
      observedMarketplaceIds: result.authorizedMarketplaceIds,
      hasIndiaMarketplace: result.hasIndiaMarketplace,
      indiaParticipation: result.indiaParticipation || null,
      participations: result.participations,
      diagnostics: result.diagnostics,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_SUCCESS,
    };
  } catch (error) {
    const isAuthFailure = error.code === 'LWA_UNAUTHORIZED';
    return {
      verified: false,
      transportVerified: false,
      lwaVerified: isAuthFailure ? false : Boolean(options.lwaVerified),
      sandboxTransportVerified: false,
      sellerAuthorizationVerified: false,
      indiaMarketplaceAuthorized: false,
      verificationMode: AMAZON_VERIFICATION_MODES.FAILED,
      lastVerifiedAt: verifiedAt,
      code: error.code || 'SELLER_VERIFICATION_FAILED',
      status: error.status || 500,
      message: error.message || 'Amazon seller authorization verification failed.',
      sellingPartnerId: suppliedSellingPartnerId || null,
      marketplaceId: expectedMarketplaceId,
      authorizedMarketplaceIds: [],
      observedMarketplaceIds: [],
      hasIndiaMarketplace: false,
      participations: [],
      diagnostics: error.diagnostics || null,
      executionOutcome: AMAZON_EXECUTION_OUTCOMES.SANDBOX_HTTP_FAILURE,
    };
  }
};
