import { adminAuth } from '../config/firebase.js';
import { User } from '../modules/users/user.model.js';
import { verifyAccessToken } from '../utils/token.js';
import { errorResponse } from '../utils/apiResponse.js';

/**
 * Authentication Middleware
 * Strictly verifies Bearer token via:
 * 1. Firebase Admin SDK ID Token verification (if Firebase token), OR
 * 2. Cryptographic JWT Access Token verification
 * Never accepts fake tokens or hardcoded demo bypasses.
 */
export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized access. No token provided.',
        code: 'NO_TOKEN',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized access. Invalid token format.',
        code: 'INVALID_TOKEN_FORMAT',
      });
    }

    // 1. Try Firebase Admin ID Token verification if adminAuth is initialized
    if (adminAuth) {
      try {
        const decodedFirebaseToken = await adminAuth.verifyIdToken(token);
        if (decodedFirebaseToken && decodedFirebaseToken.uid) {
          const { uid, email, name, picture, email_verified: emailVerified } = decodedFirebaseToken;

          const normalizedEmail = email ? email.toLowerCase().trim() : null;

          // Match first by verified Firebase UID; only match/link by email when email_verified is strictly true
          let user = await User.findOne({ firebaseUid: uid });

          if (!user && normalizedEmail) {
            if (emailVerified !== true) {
              return res.status(403).json({
                success: false,
                message: 'Email address must be verified with your identity provider before linking or accessing this account.',
                code: 'EMAIL_NOT_VERIFIED',
              });
            }

            user = await User.findOne({ email: normalizedEmail });
            if (user) {
              user.firebaseUid = uid;
              await user.save();
            } else {
              // Auto-provision verified Firebase account
              user = await User.create({
                firebaseUid: uid,
                email: normalizedEmail,
                name: name || normalizedEmail.split('@')[0],
                avatar: picture || '',
                role: 'seller',
                isActive: true,
              });
            }
          }

          if (user && user.isActive === false) {
            return res.status(403).json({
              success: false,
              message: 'Account is disabled. Please contact support.',
              code: 'ACCOUNT_DISABLED',
            });
          }

          if (user) {
            req.user = {
              id: user._id.toString(),
              firebaseUid: user.firebaseUid || null,
              email: user.email,
              name: user.name,
              avatar: user.avatar || '',
              storeName: user.storeName || '',
              role: user.role || 'seller',
              storeId: user.storeId ? user.storeId.toString() : null,
              sellerId: user.sellerId || user._id.toString(),
              onboardingCompleted: Boolean(user.onboardingCompleted),
            };
            return next();
          }
        }
      } catch (firebaseErr) {
        // Not a valid Firebase token, proceed to standard JWT verification below
      }
    }

    // 2. Cryptographic JWT Access Token verification
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access token has expired',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid or forged authentication token.',
        code: 'INVALID_TOKEN',
      });
    }

    if (!decoded || decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type. Access token expected.',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    const user = await User.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found or removed.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact support.',
        code: 'ACCOUNT_DISABLED',
      });
    }

    // Verify token version (session invalidation)
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
    }

    req.user = {
      id: user._id.toString(),
      firebaseUid: user.firebaseUid || null,
      email: user.email,
      name: user.name,
      avatar: user.avatar || '',
      storeName: user.storeName || '',
      role: user.role || 'seller',
      storeId: user.storeId ? user.storeId.toString() : null,
      sellerId: user.sellerId || user._id.toString(),
      onboardingCompleted: Boolean(user.onboardingCompleted),
    };

    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message,
    });
  }
};
