import { config } from '../config/env.js';

const allowedOrigins = [
  config.clientUrl,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : []),
].filter(Boolean);

/**
 * Validates whether an incoming HTTP Origin or Referer matches an authorized platform origin
 */
export const isOriginAllowed = (origin) => {
  if (!origin) return true; // Non-browser clients, automated test suites, curl
  if (allowedOrigins.includes(origin)) return true;
  if (config.nodeEnv !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    return true;
  }
  if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) {
    return true;
  }
  return false;
};

/**
 * Anti-CSRF middleware for cookie-authenticated endpoints
 * Rejects state-changing cross-origin requests from unauthorized external sites
 */
export const csrfProtection = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    let requestOrigin = req.headers.origin;
    if (!requestOrigin && req.headers.referer) {
      try {
        requestOrigin = new URL(req.headers.referer).origin;
      } catch (err) {
        requestOrigin = null;
      }
    }

    if (requestOrigin && !isOriginAllowed(requestOrigin)) {
      return res.status(403).json({
        success: false,
        message: 'Cross-Site Request Forgery (CSRF) protection: untrusted origin rejected',
        code: 'CSRF_BLOCKED',
      });
    }
  }
  next();
};
