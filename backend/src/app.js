import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import { isProductionEnv, isPersistentLocalAllowed, getLocalUploadRoot } from './config/storage.js';
import {
  apiLimiter,
  amazonSensitiveLimiter,
  aiLimiter,
  billingLimiter,
} from './middleware/rateLimitMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from './routes/auth.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import productRoutes from './modules/products/product.routes.js';
import categoryRoutes from './modules/products/category.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import posRoutes from './modules/pos/pos.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import returnRoutes from './modules/returns/return.routes.js';
import channelRoutes from './modules/channels/channel.routes.js';
import webhookRoutes from './modules/webhooks/webhook.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import trendRoutes from './modules/trends/trend.routes.js';
import aiIntelligenceRoutes from './modules/aiIntelligence/aiIntelligence.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';

import { isOriginAllowed, csrfProtection } from './middleware/csrfMiddleware.js';

const app = express();

// Trust first reverse proxy (Render / Vercel / load balancer) so req.ip and rate limiters see real client IP
app.set('trust proxy', 1);

// Disable Express signature header
app.disable('x-powered-by');

// HTTP security headers via Helmet (HSTS, nosniff, frameguard, referrerPolicy, CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProductionEnv()
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Express Middleware: Strict CORS with explicit allowed origins only (no wildcard *.vercel.app)
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, origin || true);
      }
      const corsErr = new Error(`CORS blocked for untrusted origin: ${origin}`);
      corsErr.status = 403;
      corsErr.statusCode = 403;
      corsErr.code = 'CORS_BLOCKED';
      return callback(corsErr);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['set-cookie'],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// Local upload assets: development only, or production with explicit persistent disk
if (!isProductionEnv() || isPersistentLocalAllowed()) {
  app.use('/uploads', express.static(getLocalUploadRoot()));
}

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'AI Seller Management Platform API',
    timestamp: new Date().toISOString(),
  });
});

// Baseline API rate limiter across all /api routes
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/products/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/channels', amazonSensitiveLimiter, csrfProtection, channelRoutes);
app.use('/api/v1/channels', amazonSensitiveLimiter, csrfProtection, channelRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/trends', trendRoutes);
app.use('/api/ai-intelligence', aiLimiter, aiIntelligenceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/billing', billingLimiter, billingRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
