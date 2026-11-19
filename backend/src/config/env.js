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
