import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';

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

const app = express();

// Express Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'AI Seller Management Platform API',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/products/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/trends', trendRoutes);
app.use('/api/ai-intelligence', aiIntelligenceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/billing', billingRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
