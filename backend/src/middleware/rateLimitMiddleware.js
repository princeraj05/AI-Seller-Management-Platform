const requestCounts = new Map();

/**
 * In-memory rate limiting middleware for production protection
 */
export const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute default
  const maxRequests = options.maxRequests || 100; // 100 requests per window default

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl || req.path}_${ip}`;
    const now = Date.now();

    let record = requestCounts.get(key);
    if (!record || now - record.startTime > windowMs) {
      record = { count: 1, startTime: now };
      requestCounts.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    return next();
  };
};

export const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
export const authLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 15 });
export const aiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });
export const billingLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20 });
