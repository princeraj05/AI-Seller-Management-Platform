import { config } from './src/config/env.js';
import { AmazonSpApiClient } from './src/integrations/marketplaces/amazon/amazon.client.js';

function validateAmazonConfiguration() {
  console.log('----------------------------------------------------');
  console.log('🔍 VALIDATING AMAZON SP-API SANDBOX CONFIGURATION');
  console.log('----------------------------------------------------');

  const hasClientId = Boolean(config.amazon?.clientId && config.amazon.clientId.trim().length > 0);
  const hasClientSecret = Boolean(config.amazon?.clientSecret && config.amazon.clientSecret.trim().length > 0);
  const hasAppId = Boolean(config.amazon?.appId && config.amazon.appId.trim().length > 0);
  const isSandboxEnv = config.amazon?.env === 'sandbox';

  console.log(`Amazon Sandbox credentials configured: ${hasClientId && hasClientSecret ? 'YES' : 'NO'}`);
  console.log(`Amazon Client Identifier present: ${hasClientId ? 'YES' : 'NO'}`);
  console.log(`Amazon Client Secret present: ${hasClientSecret ? 'YES' : 'NO'}`);
  console.log(`Amazon App ID configured: ${hasAppId ? 'YES' : 'NO'}`);
  console.log(`Amazon SP-API Environment: ${config.amazon?.env || 'not set'}`);
  console.log(`Amazon SP-API Endpoint: ${config.amazon?.endpoint || 'not set'}`);

  // Instantiate client using loaded env configuration (no credentials passed in constructor)
  const client = new AmazonSpApiClient();
  const clientConfigured = Boolean(client.credentials.clientId && client.credentials.clientSecret);
  const clientSandbox = client.credentials.sandbox === true;

  console.log(`AmazonSpApiClient initialized from env: ${clientConfigured ? 'YES' : 'NO'}`);
  console.log(`AmazonSpApiClient baseUrl: ${client.baseUrl}`);

  if (hasClientId && hasClientSecret && isSandboxEnv && clientConfigured && clientSandbox) {
    console.log('\n✅ All Amazon SP-API Sandbox configuration checks passed successfully.');
    process.exit(0);
  } else {
    console.error('\n❌ Amazon SP-API Sandbox configuration validation failed.');
    process.exit(1);
  }
}

validateAmazonConfiguration();
