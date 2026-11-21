import { config } from '../config/env.js';

const normalizeOrigin = (origin) => {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '');
};

/**
 * Compute explicit allowlist of trusted origins from CLIENT_URL and ALLOWED_ORIGINS.
 * Wildcard *.vercel.app origins are strictly prohibited.
 */
export const getAllowedOrigins = (env = process.env) => {
  const isProd = (env.NODE_ENV || config.nodeEnv || 'development') === 'production';
  const configuredClientUrl = env.CLIENT_URL !== undefined ? env.CLIENT_URL : config.clientUrl;
  const rawAllowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean)
    : [];

  const list = [
    normalizeOrigin(configuredClientUrl),
    ...rawAllowed,
  ];

  // Allow local development origins only outside production
  if (!isProd) {
    list.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  return Array.from(new Set(list.filter(Boolean)));
};

/**
 * Validates whether an incoming HTTP Origin or Referer matches an explicitly authorized platform origin.
 * Never permits arbitrary *.vercel.app subdomains.
 */
export const isOriginAllowed = (origin, env = process.env) => {
  if (!origin) return true; // Non-browser clients, automated test suites, curl

  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  const allowed = getAllowedOrigins(env);
  if (allowed.includes(normalized)) {
    return true;
  }

  const isProd = (env.NODE_ENV || config.nodeEnv || 'development') === 'production';
  if (!isProd && (normalized.startsWith('http://localhost:') || normalized.startsWith('http://127.0.0.1:'))) {
    return true;
  }

  return false;
};

/**
 * Anti-CSRF middleware for cookie-authenticated and sensitive state-changing endpoints.
 * Rejects cross-origin state-changing requests from unauthorized external sites.
 */
export const csrfProtection = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    let requestOrigin = req.headers.origin;
    if (!requestOrigin && req.headers.referer) {
      try {
        requestOrigin = new URL(req.headers.referer).origin;
      } catch {
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
