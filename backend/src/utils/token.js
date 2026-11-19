import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { RefreshToken } from '../modules/users/refreshToken.model.js';

/**
 * Computes SHA-256 hash of a token string for safe storage
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Parse expiration string (e.g., '15m', '7d') into milliseconds
 */
export const parseExpiresInMs = (expiresIn) => {
  if (typeof expiresIn === 'number') return expiresIn * 1000;
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return val * 1000;
  }
};

/**
 * Generate cryptographically signed Access Token
 */
export const generateAccessToken = (user) => {
  const payload = {
    sub: user._id.toString(),
    role: user.role || 'seller',
    tokenVersion: user.tokenVersion || 0,
    type: 'access',
  };

  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
    algorithm: 'HS256',
  });
};

/**
 * Generate cryptographically signed Refresh Token and store hashed record in MongoDB
 */
export const generateRefreshToken = async (user, family = null) => {
  const tokenFamily = family || crypto.randomUUID();
  const jti = crypto.randomUUID();
  const ms = parseExpiresInMs(config.jwt.refreshExpiresIn);
  const expiresAt = new Date(Date.now() + ms);

  const payload = {
    sub: user._id.toString(),
    tokenVersion: user.tokenVersion || 0,
    family: tokenFamily,
    jti,
    type: 'refresh',
  };

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    algorithm: 'HS256',
  });

  const tokenHash = hashToken(refreshToken);

  try {
    await RefreshToken.create({
      userId: user._id,
      tokenHash,
      family: tokenFamily,
      isRevoked: false,
      expiresAt,
    });
  } catch (error) {
    console.error('Failed to persist refresh token:', error.message);
  }

  return { refreshToken, family: tokenFamily, expiresAt };
};

/**
 * Verify Access Token
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ['HS256'],
  });
};

/**
 * Verify Refresh Token
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ['HS256'],
  });
};

/**
 * Common cookie options ensuring set and clear always match exactly
 */
export const getRefreshTokenCookieOptions = () => {
  const isProd = config.nodeEnv === 'production';
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
  if (process.env.COOKIE_DOMAIN) {
    opts.domain = process.env.COOKIE_DOMAIN;
  }
  return opts;
};

/**
 * Configure HttpOnly cookie for Refresh Token
 */
export const setRefreshTokenCookie = (res, refreshToken) => {
  const ms = parseExpiresInMs(config.jwt.refreshExpiresIn);
  const opts = getRefreshTokenCookieOptions();

  res.cookie('refreshToken', refreshToken, {
    ...opts,
    maxAge: ms,
  });
};

/**
 * Clear HttpOnly cookie for Refresh Token with exact matching attributes
 */
export const clearRefreshTokenCookie = (res) => {
  const opts = getRefreshTokenCookieOptions();
  res.clearCookie('refreshToken', opts);
};
