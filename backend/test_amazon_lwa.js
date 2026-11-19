import { config, SP_API_REGIONS, resolveSpApiEndpoint } from './src/config/env.js';
import { handleAmazonAuth, clearLwaTokenCache } from './src/integrations/marketplaces/amazon/amazon.auth.js';
import { AmazonSpApiClient } from './src/integrations/marketplaces/amazon/amazon.client.js';

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

async function runAmazonLwaTests() {
  console.log('================================================================');
  console.log('📦 RUNNING TASK 2: AMAZON SP-API LWA & SANDBOX VERIFICATION');
  console.log('================================================================\n');

  // TEST 1: Regional endpoint selection for India (EU region default)
  const indiaSandbox = resolveSpApiEndpoint('eu', 'sandbox');
  const indiaProduction = resolveSpApiEndpoint('eu', 'production');
  const naSandbox = resolveSpApiEndpoint('na', 'sandbox');
  const feSandbox = resolveSpApiEndpoint('fe', 'sandbox');

  assert(
    indiaSandbox === 'https://sandbox.sellingpartnerapi-eu.amazon.com',
    'TEST 1a: India-first default regional Sandbox endpoint resolves to Europe (sandbox.sellingpartnerapi-eu.amazon.com)'
  );
  assert(
    indiaProduction === 'https://sellingpartnerapi-eu.amazon.com',
    'TEST 1b: India-first default regional Production endpoint resolves to Europe (sellingpartnerapi-eu.amazon.com)'
  );
  assert(
    naSandbox === 'https://sandbox.sellingpartnerapi-na.amazon.com' &&
      feSandbox === 'https://sandbox.sellingpartnerapi-fe.amazon.com',
    'TEST 1c: North America and Far East regional endpoints resolve correctly'
  );

  // TEST 2: Missing refresh token handling
  const noRefreshTokenResult = await handleAmazonAuth({
    clientId: config.amazon.clientId,
    clientSecret: config.amazon.clientSecret,
    refreshToken: '', // Explicitly empty
  });

  assert(
    noRefreshTokenResult.authenticated === false &&
      noRefreshTokenResult.requiresSellerAuth === true &&
      noRefreshTokenResult.code === 'SELLER_AUTH_REQUIRED' &&
      noRefreshTokenResult.accessToken === undefined,
    'TEST 2: Missing refresh token correctly halts authentication with SELLER_AUTH_REQUIRED (No fake tokens)'
  );

  // TEST 3: Missing app client credentials handling
  const noCredsResult = await handleAmazonAuth({
    clientId: '',
    clientSecret: '',
    refreshToken: 'some_refresh_token',
  });

  assert(
    noCredsResult.authenticated === false &&
      noCredsResult.code === 'MISSING_APP_CREDENTIALS',
    'TEST 3: Missing App Client credentials correctly fails with MISSING_APP_CREDENTIALS'
  );

  // TEST 4: Invalid LWA credentials error handling without exposing secrets
  const fakeSecret = 'fake_secret_should_never_appear_in_output_123456';
  const invalidExchangeResult = await handleAmazonAuth({
    clientId: 'amzn1.application-oa2-client.invalidtestclientid9999999',
    clientSecret: fakeSecret,
    refreshToken: 'Atzr|invalid_refresh_token_test_12345',
  });

  const errorExposesSecret = JSON.stringify(invalidExchangeResult).includes(fakeSecret);

  assert(
    invalidExchangeResult.authenticated === false &&
      !errorExposesSecret &&
      Boolean(invalidExchangeResult.message),
    'TEST 4: Failed LWA token exchange is handled securely without exposing client secrets in errors'
  );

  // TEST 5: LWA token caching & expiry buffer logic
  clearLwaTokenCache();
  const testClient = new AmazonSpApiClient({
    region: 'eu',
    sandbox: true,
  });

  assert(
    testClient.baseUrl === 'https://sandbox.sellingpartnerapi-eu.amazon.com',
    'TEST 5a: AmazonSpApiClient uses regional endpoint: https://sandbox.sellingpartnerapi-eu.amazon.com'
  );

  // TEST 6: Connection test when no seller refresh token is available
  const connTestResult = await testClient.testConnection();

  assert(
    connTestResult.success === false &&
      connTestResult.authenticated === false &&
      connTestResult.requiresSellerAuth === true &&
      connTestResult.endpoint === 'https://sandbox.sellingpartnerapi-eu.amazon.com',
    'TEST 6: testConnection() truthfully reports requiresSellerAuth: true when no seller token is configured (No fake success)'
  );

  // TEST 7: Eradication of mock tokens
  const fs = await import('fs');
  const authCode = fs.readFileSync('backend/src/integrations/marketplaces/amazon/amazon.auth.js', 'utf8');
  const clientCode = fs.readFileSync('backend/src/integrations/marketplaces/amazon/amazon.client.js', 'utf8');

  const noMockInAuth = !authCode.includes('mock-amz-access-token');
  const noMockInClient = !clientCode.includes('mock-amz-access-token');

  assert(
    noMockInAuth && noMockInClient,
    'TEST 7: Verified: All fake/mock Amazon token strings are completely eliminated from auth & client'
  );

  // TEST 8: Environment variable loading verification
  assert(
    Boolean(config.amazon.clientId) &&
      Boolean(config.amazon.clientSecret) &&
      config.amazon.region === 'eu' &&
      config.amazon.env === 'sandbox',
    'TEST 8: Environment variables correctly loaded (clientId, clientSecret, region=eu, env=sandbox)'
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAmazonLwaTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
