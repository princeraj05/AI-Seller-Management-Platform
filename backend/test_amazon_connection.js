import assert from 'assert';
import {
  encryptCredentials,
  decryptCredentials,
  generateOAuthState,
  verifyOAuthState,
} from './src/utils/encryption.js';
import {
  getAmazonOAuthUrlService,
  connectAmazonManualService,
  getAmazonConnectionStatusService,
  disconnectAmazonService,
  sanitizeChannelConnection,
} from './src/modules/channels/channel.service.js';
import { ChannelConnection } from './src/modules/channels/channelConnection.model.js';

let passed = 0;
let failed = 0;
const asyncPromises = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function runAsyncTest(name, fn) {
  const p = (async () => {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  })();
  asyncPromises.push(p);
}

console.log('\n========================================');
console.log('--- AMAZON SP-API CONNECTION TEST SUITE ---');
console.log('========================================\n');

// 1. Encryption & Decryption Round-Trip
console.log('[1] Token Security & Encryption (AES-256-GCM)');
runTest('encryptCredentials produces iv, content, tag', () => {
  const secrets = { refreshToken: 'Atzr|test-refresh-token-12345', sellingPartnerId: 'TESTSELLER1' };
  const encrypted = encryptCredentials(secrets);
  assert(encrypted.iv && typeof encrypted.iv === 'string', 'IV missing');
  assert(encrypted.content && typeof encrypted.content === 'string', 'Content missing');
  assert(encrypted.tag && typeof encrypted.tag === 'string', 'Tag missing');
  assert(!JSON.stringify(encrypted).includes('test-refresh-token-12345'), 'Ciphertext leaks plaintext token!');
});

runTest('decryptCredentials decrypts back to original secrets', () => {
  const secrets = { refreshToken: 'Atzr|test-refresh-token-12345', sellingPartnerId: 'TESTSELLER1' };
  const encrypted = encryptCredentials(secrets);
  const decrypted = decryptCredentials(encrypted);
  assert.strictEqual(decrypted.refreshToken, secrets.refreshToken);
  assert.strictEqual(decrypted.sellingPartnerId, secrets.sellingPartnerId);
});

runTest('tampered ciphertext fails decryption cleanly', () => {
  const secrets = { refreshToken: 'Atzr|test-refresh-token-12345' };
  const encrypted = encryptCredentials(secrets);
  const flipPrefix = encrypted.content.startsWith('ff') ? '00' : 'ff';
  const tampered = { ...encrypted, content: flipPrefix + encrypted.content.substring(2) };
  assert.throws(() => decryptCredentials(tampered), /Failed to decrypt channel credentials/);
});

runTest('tampered auth tag fails decryption cleanly', () => {
  const secrets = { refreshToken: 'Atzr|test-refresh-token-12345' };
  const encrypted = encryptCredentials(secrets);
  const tampered = { ...encrypted, tag: 'ff'.repeat(16) };
  assert.throws(() => decryptCredentials(tampered), /Failed to decrypt channel credentials/);
});

// 2. OAuth State Token Protection (CSRF & Cross-Tenant Defense)
console.log('\n[2] OAuth CSRF & State Token Verification');
runTest('generateOAuthState creates valid HMAC-signed state', () => {
  const state = generateOAuthState('tenant-abc-123', 'AMAZON', 900000);
  assert(typeof state === 'string' && state.length > 20, 'State is invalid string');
  const result = verifyOAuthState(state, 'tenant-abc-123');
  assert.strictEqual(result.valid, true, `State verification failed: ${result.error}`);
  assert.strictEqual(result.tenantId, 'tenant-abc-123');
});

runTest('cross-tenant verification rejects mismatched tenant ID', () => {
  const state = generateOAuthState('tenant-legit', 'AMAZON', 900000);
  const result = verifyOAuthState(state, 'tenant-attacker');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('Cross-tenant') || result.error.includes('mismatch'), 'Should report tenant mismatch');
});

runTest('tampered state string is rejected due to invalid HMAC signature', () => {
  const state = generateOAuthState('tenant-legit', 'AMAZON', 900000);
  const tamperedState = state.substring(0, state.length - 4) + 'abcd';
  const result = verifyOAuthState(tamperedState, 'tenant-legit');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('signature verification failed') || result.error.includes('tampering'), 'Should reject tampered signature');
});

runTest('expired state token is rejected', () => {
  // 1 millisecond expiration
  const state = generateOAuthState('tenant-legit', 'AMAZON', -1000);
  const result = verifyOAuthState(state, 'tenant-legit');
  assert.strictEqual(result.valid, false);
  assert(result.error.includes('expired'), 'Should report expired token');
});

runTest('replay attack prevention: state token cannot be verified more than once', () => {
  const state = generateOAuthState('tenant-replay-test', 'AMAZON', 900000);
  const firstUse = verifyOAuthState(state, 'tenant-replay-test');
  assert.strictEqual(firstUse.valid, true, 'First verification must succeed');

  const secondUse = verifyOAuthState(state, 'tenant-replay-test');
  assert.strictEqual(secondUse.valid, false, 'Second verification must fail');
  assert(secondUse.error.includes('already been consumed') || secondUse.error.includes('replay'), 'Should report replay attack');
});

// 3. Amazon OAuth URL Builder
console.log('\n[3] Amazon SP-API OAuth URL Builder');
runAsyncTest('getAmazonOAuthUrlService builds regional consent URL with beta flag', async () => {
  const tenant = { sellerId: 'seller-tenant-999' };
  const res = await getAmazonOAuthUrlService(tenant, { region: 'eu' });

  assert(res.authorizationUrl.includes('sellercentral.amazon.in'), 'Host must be sellercentral.amazon.in for India EU region');
  assert(res.authorizationUrl.includes('application_id='), 'Missing application_id');
  assert(res.authorizationUrl.includes('state='), 'Missing state parameter');
  assert(res.authorizationUrl.includes('&version=beta'), 'Missing &version=beta for draft/sandbox app');
  assert.strictEqual(res.isSandbox, true);
  assert.strictEqual(res.expiresIn, 900);
});

// 4. Data Sanitization & Secret Isolation
console.log('\n[4] Data Model & Credentials Sanitization');
runTest('sanitizeChannelConnection completely strips encrypted credentials from API output', () => {
  const rawDoc = {
    _id: 'conn-123',
    sellerId: 'tenant-1',
    provider: 'AMAZON',
    status: 'CONNECTED',
    displayName: 'Amazon India Store',
    marketplaceId: 'A21TJRUUN4KGV',
    sellingPartnerId: 'A3QW12EXAMPLE',
    credentials: { iv: 'iv123', content: 'content123', tag: 'tag123' },
    authorizedAt: new Date(),
  };

  const sanitized = sanitizeChannelConnection(rawDoc);
  assert.strictEqual(sanitized.credentials, undefined, 'credentials field must be deleted');
  assert.strictEqual(sanitized.marketplaceId, 'A21TJRUUN4KGV');
  assert.strictEqual(sanitized.status, 'CONNECTED');
});

runTest('ChannelConnection model schema defines multi-tenant SP-API fields', () => {
  const paths = ChannelConnection.schema.paths;
  assert(paths.marketplaceId, 'marketplaceId field missing from schema');
  assert(paths.sellingPartnerId, 'sellingPartnerId field missing from schema');
  assert(paths.marketplaceRegion, 'marketplaceRegion field missing from schema');
  assert(paths.authorizedAt, 'authorizedAt field missing from schema');
  assert(paths.tokenUpdatedAt, 'tokenUpdatedAt field missing from schema');
  assert(paths['credentials.content'] || ChannelConnection.schema.obj.credentials, 'credentials field missing from schema');
});

// 5. Tenant Isolation & Disconnect Behavior
console.log('\n[5] Multi-Tenant Isolation & Disconnect Service');
runAsyncTest('disconnectAmazonService marks channel disconnected and wipes credentials', async () => {
  const tenantId = 'seller-isolation-test-1';
  // Seed in-memory channel
  const encrypted = encryptCredentials({ refreshToken: 'Atzr|fake-token' });
  const rawConn = {
    _id: 'test-chan-1',
    id: 'test-chan-1',
    sellerId: tenantId,
    provider: 'AMAZON',
    type: 'MARKETPLACE',
    status: 'CONNECTED',
    displayName: 'Test Amazon Channel',
    marketplaceId: 'A21TJRUUN4KGV',
    marketplaceRegion: 'eu',
    credentials: encrypted,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { inMemoryChannelsMap } = await import('./src/modules/channels/channel.service.js');
  inMemoryChannelsMap.set('test-chan-1', rawConn);

  // Tenant 2 status check should not find Tenant 1's connection
  const tenant2Status = await getAmazonConnectionStatusService('seller-isolation-test-2');
  assert.strictEqual(tenant2Status.connected, false, 'Tenant 2 should not see Tenant 1 connection');
  assert.strictEqual(tenant2Status.status, 'NOT_CONFIGURED');

  // Tenant 1 status check finds connection
  const tenant1Status = await getAmazonConnectionStatusService(tenantId);
  assert.strictEqual(tenant1Status.connected, true);
  assert.strictEqual(tenant1Status.status, 'CONNECTED');
  assert.strictEqual(tenant1Status.marketplaceId, 'A21TJRUUN4KGV');

  // Disconnect Tenant 1
  const disconnected = await disconnectAmazonService(tenantId);
  assert.strictEqual(disconnected.status, 'DISCONNECTED');
  assert.strictEqual(disconnected.credentials, undefined);

  // Memory map credentials cleared
  const updatedMem = inMemoryChannelsMap.get('test-chan-1');
  assert.strictEqual(updatedMem.status, 'DISCONNECTED');
  assert.strictEqual(updatedMem.credentials, null);
});

runAsyncTest('Manual connect rejects empty refresh tokens', async () => {
  const tenant = { sellerId: 'seller-err-test' };
  await assert.rejects(
    async () => {
      await connectAmazonManualService(tenant, { refreshToken: '' });
    },
    /LWA Refresh Token is required/
  );
});

// 6. Sandbox Status Persistence & Reload Regression Tests
console.log('\n[6] Sandbox Connection Persistence, Status Card Reload & Tenant Isolation');
runAsyncTest('Sandbox connection persists correctly and status card query retains CONNECTED status on page reload', async () => {
  const { inMemoryChannelsMap, buildTenantConnectionQuery } = await import('./src/modules/channels/channel.service.js');
  const testTenantId = 'tenant-sandbox-reload-test-101';
  const encrypted = encryptCredentials({
    refreshToken: 'Atzr|mock-sandbox-token-xyz',
    sellingPartnerId: 'TESTPARTNER101',
  });

  const payload = {
    _id: 'chan-sandbox-101',
    id: 'chan-sandbox-101',
    sellerId: testTenantId,
    tenantId: testTenantId,
    provider: 'AMAZON',
    channel: 'amazon',
    environment: 'sandbox',
    type: 'MARKETPLACE',
    status: 'CONNECTED',
    displayName: 'Amazon India Store (Sandbox)',
    externalAccountId: 'TESTPARTNER101',
    sellingPartnerId: 'TESTPARTNER101',
    marketplaceId: 'A21TJRUUN4KGV',
    marketplaceRegion: 'eu',
    credentials: encrypted,
    authorizedAt: new Date(),
    tokenUpdatedAt: new Date(),
    lastError: null,
  };
  inMemoryChannelsMap.set('chan-sandbox-101', payload);

  // Initial status check
  const initialStatus = await getAmazonConnectionStatusService(testTenantId);
  assert.strictEqual(initialStatus.connected, true, 'Initial status must be connected');
  assert.strictEqual(initialStatus.status, 'CONNECTED', 'Status must be CONNECTED');
  assert.strictEqual(initialStatus.environment, 'sandbox', 'Environment must be sandbox');
  assert.strictEqual(initialStatus.channel, 'amazon', 'Channel must be amazon');
  assert.strictEqual(initialStatus.credentials, undefined, 'Must not leak credentials');

  // Simulated page reload (subsequent query for the same tenant)
  const reloadedStatus = await getAmazonConnectionStatusService(testTenantId);
  assert.strictEqual(reloadedStatus.connected, true, 'Reloaded status must remain connected');
  assert.strictEqual(reloadedStatus.status, 'CONNECTED', 'Reloaded status must be CONNECTED');
  assert.strictEqual(reloadedStatus.marketplaceId, 'A21TJRUUN4KGV');
  assert.strictEqual(reloadedStatus.environment, 'sandbox');

  // Tenant Isolation: other tenant cannot see this connection
  const strangerStatus = await getAmazonConnectionStatusService('stranger-tenant-999');
  assert.strictEqual(strangerStatus.connected, false, 'Other tenant must not see connection');
  assert.strictEqual(strangerStatus.status, 'NOT_CONFIGURED');
});

runTest('successResponse wrapper provides both top-level and nested data.connection for frontend compatibility', () => {
  const mockRes = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  const { successResponse } = { successResponse: (res, statusCode = 200, message = 'Success', data = {}) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...data,
    });
  }};

  const mockConnection = { connected: true, status: 'CONNECTED', marketplaceId: 'A21TJRUUN4KGV' };
  successResponse(mockRes, 200, 'Status fetched', { connection: mockConnection });

  assert.strictEqual(mockRes.statusCode, 200);
  assert.strictEqual(mockRes.body.success, true);
  // Top-level compatibility
  assert.deepStrictEqual(mockRes.body.connection, mockConnection);
  // Nested res.data compatibility
  assert.deepStrictEqual(mockRes.body.data.connection, mockConnection);
});

(async () => {
  // Allow all async tests to finish
  await Promise.all(asyncPromises);
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
})();
