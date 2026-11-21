import rateLimit from 'express-rate-limit';

/**
 * Factory for standard express-rate-limit middleware with consistent JSON 429 responses
 */
export const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || options.maxRequests || 100;
  const message = options.message || 'Too many requests. Please try again later.';

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.DISABLE_RATE_LIMIT === 'true',
    handler: (req, res) => {
      return res.status(429).json({
        success: false,
        message,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    },
  });
};

// General API rate limit (per IP)
export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  message: 'Too many API requests. Please slow down and try again shortly.',
});

// Authentication endpoints (login, register, Google OAuth, token refresh)
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts. Please wait before trying again.',
});

// Strict limit for password reset & password change endpoints
export const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please try again in 15 minutes.',
});

// Sensitive Amazon / marketplace channel endpoints (OAuth, connect, disconnect, sync, submit)
export const amazonSensitiveLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many marketplace channel requests. Please try again shortly.',
});

// AI generation endpoints
export const aiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many AI generation requests. Please try again shortly.',
});

// Billing endpoints
export const billingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many billing requests. Please try again shortly.',
});
