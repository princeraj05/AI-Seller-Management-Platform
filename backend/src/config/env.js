import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load backend/.env, falling back to current working directory .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

export const DEV_DEFAULT_AI_SECRET = 'dev_internal_ai_service_secret_key_change_in_production_32b';
export const EXAMPLE_PLACEHOLDER_AI_SECRET = 'your_32_character_internal_service_secret_here';

const INSECURE_PLACEHOLDER_SECRETS = new Set([
  DEV_DEFAULT_AI_SECRET,
  EXAMPLE_PLACEHOLDER_AI_SECRET,
  'your_32_byte_secret_key_here',
  'your_super_secret_jwt_access_key_min_32_chars_long',
  'your_super_secret_jwt_refresh_key_min_32_chars_long',
  'dev-insecure-jwt-access-secret-32-chars-long!',
  'dev-insecure-jwt-refresh-secret-32-chars-long!',
]);

/**
 * Validates and normalizes AI_SERVICE_SECRET.
 * In production:
 * - Rejects missing, empty, or whitespace-only secrets
 * - Rejects secrets shorter than 32 characters after trimming
 * - Rejects the development default secret (including whitespace-padded variations)
 * - Rejects the documented example placeholder (including whitespace-padded variations)
 * - Rejects other documented insecure placeholder values
 * In development:
 * - Falls back to DEV_DEFAULT_AI_SECRET if missing or empty
 *
 * @param {string|undefined|null} secret - Secret value from environment
 * @param {boolean} [isProd=isProduction] - Production environment flag
 * @returns {string} Normalized secret
 */
export const validateAiServiceSecret = (secret, isProd = isProduction) => {
  const normalized = secret !== undefined && secret !== null ? String(secret).trim() : '';

  if (isProd) {
    if (!normalized) {
      throw new Error('CRITICAL SECURITY ERROR: AI_SERVICE_SECRET must be set and non-empty in production.');
    }
    if (normalized.length < 32) {
      throw new Error('CRITICAL SECURITY ERROR: AI_SERVICE_SECRET must be at least 32 characters long in production.');
    }
    if (normalized === DEV_DEFAULT_AI_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use the development default secret in production.');
    }
    if (normalized === EXAMPLE_PLACEHOLDER_AI_SECRET) {
      throw new Error('CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use the example placeholder secret in production.');
    }
    if (INSECURE_PLACEHOLDER_SECRETS.has(normalized)) {
      throw new Error('CRITICAL SECURITY ERROR: AI_SERVICE_SECRET cannot use a documented placeholder secret in production.');
    }
    return normalized;
  }

  return normalized || DEV_DEFAULT_AI_SECRET;
};

const aiServiceSecret = validateAiServiceSecret(process.env.AI_SERVICE_SECRET, isProduction);

// Validate AI_SERVICE_TIMEOUT: defaults to 60000ms, must be a positive safe integer if provided
const rawAiServiceTimeout = process.env.AI_SERVICE_TIMEOUT;
let aiServiceTimeout = 60000;
if (rawAiServiceTimeout !== undefined && rawAiServiceTimeout !== null && String(rawAiServiceTimeout).trim() !== '') {
  const parsed = Number(rawAiServiceTimeout);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('AI_SERVICE_TIMEOUT must be a positive safe integer representing milliseconds.');
  }
  aiServiceTimeout = parsed;
}

// In production, strictly enforce strong, separate secrets
if (isProduction) {
  if (!jwtAccessSecret || jwtAccessSecret.length < 32) {
    throw new Error('CRITICAL SECURITY ERROR: JWT_ACCESS_SECRET must be set and at least 32 characters in production.');
  }
  if (!jwtRefreshSecret || jwtRefreshSecret.length < 32) {
    throw new Error('CRITICAL SECURITY ERROR: JWT_REFRESH_SECRET must be set and at least 32 characters in production.');
  }
  if (jwtAccessSecret === jwtRefreshSecret) {
    throw new Error('CRITICAL SECURITY ERROR: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct secrets.');
  }
}

// Regional Selling Partner API Endpoints (India-first uses Europe region 'eu')
export const SP_API_REGIONS = {
  na: {
    name: 'North America',
    production: 'https://sellingpartnerapi-na.amazon.com',
    sandbox: 'https://sandbox.sellingpartnerapi-na.amazon.com',
    marketplaces: ['US', 'CA', 'MX', 'BR'],
  },
  eu: {
    name: 'Europe & India',
    production: 'https://sellingpartnerapi-eu.amazon.com',
    sandbox: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
    marketplaces: ['IN', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'TR', 'SA', 'AE', 'EG', 'PL', 'SE', 'BE'],
  },
  fe: {
    name: 'Far East',
    production: 'https://sellingpartnerapi-fe.amazon.com',
    sandbox: 'https://sandbox.sellingpartnerapi-fe.amazon.com',
    marketplaces: ['SG', 'AU', 'JP'],
  },
};

export const resolveSpApiEndpoint = (region = 'eu', env = 'sandbox') => {
  const normRegion = (region || 'eu').toLowerCase().trim();
  const regionConfig = SP_API_REGIONS[normRegion] || SP_API_REGIONS.eu;
  const isProd = (env || 'sandbox').toLowerCase().trim() === 'production';
  return isProd ? regionConfig.production : regionConfig.sandbox;
};

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_seller_management',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  jwt: {
    accessSecret: jwtAccessSecret || 'dev-insecure-jwt-access-secret-32-chars-long!',
    refreshSecret: jwtRefreshSecret || 'dev-insecure-jwt-refresh-secret-32-chars-long!',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  },
  aiService: {
    url: (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    secret: aiServiceSecret,
    timeout: aiServiceTimeout,
  },
  amazon: {
    clientId: process.env.AMAZON_SP_API_CLIENT_ID || '',
    clientSecret: process.env.AMAZON_SP_API_CLIENT_SECRET || '',
    appId: process.env.AMAZON_SP_API_APP_ID || '',
    env: process.env.AMAZON_SP_API_ENV || 'sandbox',
    region: (process.env.AMAZON_SP_API_REGION || 'eu').toLowerCase().trim(),
    refreshToken: process.env.AMAZON_SP_API_REFRESH_TOKEN || '',
    endpoint: resolveSpApiEndpoint(
      process.env.AMAZON_SP_API_REGION || 'eu',
      process.env.AMAZON_SP_API_ENV || 'sandbox'
    ),
    lwaEndpoint: 'https://api.amazon.com/auth/o2/token',
  },
};
