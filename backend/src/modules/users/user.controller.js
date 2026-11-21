import crypto from 'crypto';
import mongoose from 'mongoose';
import { User } from './user.model.js';
import { Store } from '../onboarding/store.model.js';
import { RefreshToken } from './refreshToken.model.js';
import { PasswordResetToken } from './passwordResetToken.model.js';
import { adminAuth } from '../../config/firebase.js';
import { sendNotificationEmailService } from '../../services/email/email.service.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '../../utils/token.js';

/**
 * @desc    Authenticate with Google / Firebase ID token & return cryptographic JWT access + refresh tokens
 * @route   POST /api/auth/google
 * @access  Public
 */
export const loginWithGoogle = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable. Please check your MongoDB connection settings in .env.',
        code: 'DB_UNAVAILABLE',
      });
    }

    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID token is required',
        code: 'MISSING_ID_TOKEN',
      });
    }

    if (!adminAuth) {
      return res.status(503).json({
        success: false,
        message: 'Google authentication service is currently unavailable',
        code: 'FIREBASE_UNAVAILABLE',
      });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (verifyErr) {
      console.error('Firebase token verification error:', verifyErr.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Google authentication token',
        code: 'INVALID_FIREBASE_TOKEN',
      });
    }

    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({
        success: false,
        message: 'Google authentication failed: missing user identity',
        code: 'INVALID_TOKEN_CLAIMS',
      });
    }

    const { uid, email, name, picture, email_verified: emailVerified } = decodedToken;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google account does not provide an email address',
        code: 'EMAIL_REQUIRED',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // First look up by already-linked Firebase UID
    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      // Never link or provision an account by email unless Firebase confirms email_verified === true
      if (emailVerified !== true) {
        return res.status(403).json({
          success: false,
          message: 'Your Google/Firebase email address must be verified before signing in or linking accounts.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }

      user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        user = await User.create({
          firebaseUid: uid,
          email: normalizedEmail,
          name: name || normalizedEmail.split('@')[0],
          avatar: picture || '',
          role: 'seller',
          isActive: true,
        });
      } else {
        user.firebaseUid = uid;
        if (name && (!user.name || user.name === 'Prince Admin' || user.name === 'Seller')) {
          user.name = name;
        }
        if (picture && user.avatar !== picture) {
          user.avatar = picture;
        }
        await user.save();
      }
    } else {
      let shouldSave = false;
      if (name && (!user.name || user.name === 'Prince Admin' || user.name === 'Seller')) {
        user.name = name;
        shouldSave = true;
      }
      if (picture && user.avatar !== picture) {
        user.avatar = picture;
        shouldSave = true;
      }
      if (shouldSave) {
        await user.save();
      }
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact support.',
        code: 'ACCOUNT_DISABLED',
      });
    }

    // Generate real cryptographic JWT tokens for persistent session
    const accessToken = generateAccessToken(user);
    const { refreshToken } = await generateRefreshToken(user);

    // Set HttpOnly, Secure, SameSite refresh token cookie (never exposed in JSON)
    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Google sign-in successful',
      token: accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        storeName: user.storeName,
        role: user.role,
        sellerId: user.sellerId || user._id.toString(),
        onboardingCompleted: Boolean(user.onboardingCompleted),
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during Google authentication',
    });
  }
};

/**
 * @desc    Authenticate user & return cryptographic JWT access + refresh tokens
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable. Please check your MongoDB connection settings in .env.',
        code: 'DB_UNAVAILABLE',
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Query user and explicitly select password field
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact support.',
      });
    }

    // Google-only accounts without a local password set yet
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          'This account was created with Google Sign-In. Please click "Continue with Google" or use "Forgot password?" to set a password.',
        code: 'GOOGLE_ACCOUNT_ONLY',
      });
    }

    // Migration Strategy for Legacy Plaintext Passwords:
    // If the existing user password is not bcrypt-hashed, reject login and require password reset
    if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      return res.status(403).json({
        success: false,
        message:
          'Security upgrade required: Your account requires a password update before login. Please use the password reset endpoint.',
        code: 'PASSWORD_RESET_REQUIRED',
      });
    }

    // Verify password using bcrypt.compare
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Generate real cryptographic JWT tokens
    const accessToken = generateAccessToken(user);
    const { refreshToken } = await generateRefreshToken(user);

    // Set HttpOnly, Secure cookie for refresh token (never exposed in JSON)
    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        storeName: user.storeName,
        role: user.role,
        sellerId: user.sellerId || user._id.toString(),
        onboardingCompleted: Boolean(user.onboardingCompleted),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during authentication',
    });
  }
};

/**
 * @desc    Register a new seller with bcrypt password hashing and JWT issuance
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database is currently unreachable. Please check your MongoDB connection settings in .env.',
        code: 'DB_UNAVAILABLE',
      });
    }

    const { name, email, password, storeName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists',
      });
    }

    // Create user (pre-save hook will hash password with bcrypt)
    const user = await User.create({
      name: name?.trim() || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      password,
      storeName: storeName?.trim() || 'My Seller Store',
      role: 'seller',
      isActive: true,
    });

    const accessToken = generateAccessToken(user);
    const { refreshToken } = await generateRefreshToken(user);

    setRefreshTokenCookie(res, refreshToken);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        storeName: user.storeName,
        role: user.role,
        sellerId: user.sellerId || user._id.toString(),
        onboardingCompleted: Boolean(user.onboardingCompleted),
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration',
    });
  }
};

/**
 * @desc    Refresh access token with refresh token rotation and reuse detection
 * @route   POST /api/auth/refresh
 * @access  Public
 */
export const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required',
        code: 'REFRESH_TOKEN_REQUIRED',
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token. Please sign in again.',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (!decoded || decoded.type !== 'refresh') {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Invalid token type. Refresh token expected.',
      });
    }

    const tokenHash = hashToken(token);
    const storedSession = await RefreshToken.findOne({ tokenHash });

    // REUSE DETECTION: If token is not in DB or already marked as revoked
    if (!storedSession || storedSession.isRevoked) {
      if (storedSession && storedSession.family) {
        // Revoke all tokens in this family to protect the compromised user
        await RefreshToken.updateMany({ family: storedSession.family }, { $set: { isRevoked: true } });
      }
      if (decoded.sub) {
        // Invalidate all tokens for this user
        await User.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
      }
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Refresh token reuse detected. All sessions have been revoked for your security.',
        code: 'TOKEN_REUSE_DETECTED',
      });
    }

    const user = await User.findById(decoded.sub);

    if (!user || user.isActive === false || (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (user.tokenVersion || 0))) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: 'Session has been invalidated. Please sign in again.',
        code: 'SESSION_INVALID',
      });
    }

    // Rotate: Revoke the used refresh token
    storedSession.isRevoked = true;
    await storedSession.save();

    // Generate new access token and rotated refresh token in the same family
    const newAccessToken = generateAccessToken(user);
    const { refreshToken: newRefreshToken } = await generateRefreshToken(user, storedSession.family);

    // Rotate HttpOnly cookie with new refresh token (never exposed in JSON)
    setRefreshTokenCookie(res, newRefreshToken);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: newAccessToken,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    clearRefreshTokenCookie(res);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during token refresh',
    });
  }
};

/**
 * @desc    Logout user and revoke refresh token session
 * @route   POST /api/auth/logout
 * @access  Public
 */
export const logoutUser = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;

    if (token) {
      const tokenHash = hashToken(token);
      await RefreshToken.findOneAndUpdate({ tokenHash }, { $set: { isRevoked: true } });
    }

    clearRefreshTokenCookie(res);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during logout',
    });
  }
};

/**
 * Helper: Attempt to authenticate an optional Bearer token for password-change/recovery verification
 * Returns the verified identity { userId, firebaseUid, email, emailVerified } or null.
 */
const resolveVerifiedResetSession = async (req) => {
  if (req.user && req.user.id) {
    return {
      userId: req.user.id.toString(),
      firebaseUid: req.user.firebaseUid || null,
      email: req.user.email ? req.user.email.toLowerCase().trim() : null,
      emailVerified: true,
    };
  }

  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  // 1. Try Firebase ID token (enables verified Google OAuth recovery / setting local password)
  if (adminAuth) {
    try {
      const decodedFb = await adminAuth.verifyIdToken(token);
      if (decodedFb && decodedFb.uid) {
        return {
          userId: null,
          firebaseUid: decodedFb.uid,
          email: decodedFb.email ? decodedFb.email.toLowerCase().trim() : null,
          emailVerified: decodedFb.email_verified === true,
        };
      }
    } catch {
      // Not a Firebase token; try platform JWT below
    }
  }

  // 2. Try cryptographic platform access JWT
  try {
    const decoded = verifyAccessToken(token);
    if (decoded && decoded.type === 'access' && decoded.sub) {
      const sessionUser = await User.findById(decoded.sub);
      if (
        sessionUser &&
        sessionUser.isActive !== false &&
        (decoded.tokenVersion === undefined || decoded.tokenVersion === (sessionUser.tokenVersion || 0))
      ) {
        return {
          userId: sessionUser._id.toString(),
          firebaseUid: sessionUser.firebaseUid || null,
          email: sessionUser.email ? sessionUser.email.toLowerCase().trim() : null,
          emailVerified: true,
        };
      }
    }
  } catch {
    // Invalid or expired JWT
  }

  return null;
};

/**
 * Constant-time plaintext comparison helper for legacy password migration
 */
const safePlaintextCompare = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * @desc    Request a single-use, time-limited password reset token (supports local & Google OAuth recovery)
 * @route   POST /api/auth/request-password-reset
 * @access  Public (Rate-limited; uniform response prevents email enumeration)
 */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const uniformMessage =
      'If an account with that email exists, a password reset verification code has been issued.';

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Authentication service is temporarily unavailable. Please try again later.',
        code: 'DB_UNAVAILABLE',
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (user && user.isActive !== false) {
      // Invalidate previous unused tokens for this user
      await PasswordResetToken.updateMany(
        { userId: user._id, isUsed: false },
        { $set: { isUsed: true } }
      );

      const rawResetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawResetToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await PasswordResetToken.create({
        userId: user._id,
        email: normalizedEmail,
        tokenHash,
        isUsed: false,
        expiresAt,
      });

      try {
        await sendNotificationEmailService(normalizedEmail, 'PASSWORD_RESET', {
          name: user.name,
          resetToken: rawResetToken,
          expiresInMinutes: 15,
        });
      } catch (mailErr) {
        console.warn('Password reset email dispatch failed:', mailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: uniformMessage,
    });
  } catch (error) {
    console.error('Request password reset error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Unable to process password reset request',
    });
  }
};

/**
 * @desc    Reset or update password (requires verified resetToken, verified authenticated session, or verified currentPassword)
 * @route   POST /api/auth/reset-password
 * @access  Protected by reset token, verified Bearer session, or currentPassword proof
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword, resetToken } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    // Avoid email enumeration when unauthenticated
    if (!user || user.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or password reset verification failed.',
        code: 'RESET_VERIFICATION_FAILED',
      });
    }

    const hasBcryptPassword = Boolean(
      user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))
    );
    const hasLegacyPassword = Boolean(user.password && !hasBcryptPassword);
    const isGoogleOnlyAccount = !user.password;

    let verifiedByResetToken = false;
    let verifiedBySession = false;

    // Path 1: Verified single-use reset token (atomic consumption)
    if (resetToken && typeof resetToken === 'string' && resetToken.trim()) {
      const tokenHash = hashToken(resetToken.trim());
      const consumedToken = await PasswordResetToken.findOneAndUpdate(
        {
          userId: user._id,
          email: normalizedEmail,
          tokenHash,
          isUsed: false,
          expiresAt: { $gt: new Date() },
        },
        { $set: { isUsed: true } },
        { new: true }
      );

      if (!consumedToken) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired password reset token.',
          code: 'INVALID_RESET_TOKEN',
        });
      }
      verifiedByResetToken = true;
    }

    // Path 2: Verified authenticated session (platform JWT or verified Google/Firebase ID token)
    if (!verifiedByResetToken) {
      const sessionIdentity = await resolveVerifiedResetSession(req);
      if (sessionIdentity) {
        const matchesUserId = sessionIdentity.userId && sessionIdentity.userId === user._id.toString();
        const matchesFirebaseUid =
          sessionIdentity.firebaseUid && user.firebaseUid && sessionIdentity.firebaseUid === user.firebaseUid;
        const matchesVerifiedEmail =
          sessionIdentity.emailVerified === true && sessionIdentity.email === normalizedEmail;

        if (matchesUserId || matchesFirebaseUid || matchesVerifiedEmail) {
          verifiedBySession = true;
        }
      }
    }

    // Enforce strict authorization proof — NEVER allow unauthenticated password overwrite
    if (!verifiedByResetToken) {
      if (isGoogleOnlyAccount) {
        // Google OAuth account recovery requires either a verified resetToken OR a verified Google/JWT session for this user
        if (!verifiedBySession) {
          return res.status(401).json({
            success: false,
            message:
              'Verification required: Please sign in with Google or request a verified password reset token to set a password for this account.',
            code: 'RESET_AUTH_REQUIRED',
          });
        }
      } else if (hasBcryptPassword) {
        if (!currentPassword || typeof currentPassword !== 'string') {
          return res.status(401).json({
            success: false,
            message: 'Current password or a verified reset token is required to update password.',
            code: 'CURRENT_PASSWORD_REQUIRED',
          });
        }
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'Current password does not match.',
            code: 'INVALID_CURRENT_PASSWORD',
          });
        }
      } else if (hasLegacyPassword) {
        // Legacy plaintext migration MUST verify currentPassword (or verified resetToken above)
        if (!currentPassword || typeof currentPassword !== 'string') {
          return res.status(401).json({
            success: false,
            message: 'Current password or a verified reset token is required to upgrade your password.',
            code: 'CURRENT_PASSWORD_REQUIRED',
          });
        }
        if (!safePlaintextCompare(user.password, currentPassword)) {
          return res.status(401).json({
            success: false,
            message: 'Current password does not match.',
            code: 'INVALID_CURRENT_PASSWORD',
          });
        }
      }
    }

    // Set new password (pre-save hook will hash with bcrypt)
    user.password = newPassword;
    user.mustResetPassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all prior sessions
    await user.save();

    // Revoke all existing refresh tokens & unused reset tokens for this user
    await RefreshToken.updateMany({ userId: user._id }, { $set: { isRevoked: true } });
    await PasswordResetToken.updateMany({ userId: user._id, isUsed: false }, { $set: { isUsed: true } });

    clearRefreshTokenCookie(res);

    return res.status(200).json({
      success: true,
      message: 'Password updated and hashed successfully. Please sign in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during password reset',
    });
  }
};

/**
 * @desc    Authenticated password change (or local password setup for signed-in Google OAuth sellers)
 * @route   POST /api/auth/change-password
 * @access  Private (authMiddleware)
 */
export const changePassword = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to change password.',
        code: 'UNAUTHENTICATED',
      });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user || user.isActive === false) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (user.password) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to change your password.',
        });
      }
      const isBcrypt = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
      const valid = isBcrypt
        ? await user.comparePassword(currentPassword)
        : safePlaintextCompare(user.password, currentPassword);

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: 'Current password does not match.',
        });
      }
    }

    user.password = newPassword;
    user.mustResetPassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await RefreshToken.updateMany({ userId: user._id }, { $set: { isRevoked: true } });
    clearRefreshTokenCookie(res);

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully. Please sign in again.',
    });
  } catch (error) {
    console.error('Change password error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server error during password change',
    });
  }
};

/**
 * @desc    Get current authenticated user profile & store info
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }

    let store = null;
    try {
      store = await Store.findOne({ sellerId: user.sellerId });
    } catch (err) {
      console.warn('Store query in getMe failed:', err.message);
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        storeName: store?.businessName || user.storeName || '',
        role: user.role,
        storeId: user.storeId || (store ? store._id : null),
        sellerId: user.sellerId,
        onboardingCompleted: Boolean(user.onboardingCompleted || (store && store.onboardingCompleted)),
      },
      store: store || null,
      onboardingCompleted: Boolean(user.onboardingCompleted || (store && store.onboardingCompleted)),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update current authenticated user profile & store info
 * @route   PUT /api/auth/me
 * @access  Private
 */
export const updateMe = async (req, res) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }

    const { name, storeName, businessName, mobile, gstin, supportEmail } = req.body;
    const resolvedStoreName = (businessName || storeName || '').trim();

    const user = await User.findById(authUser.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name && name.trim()) {
      user.name = name.trim();
    }
    if (resolvedStoreName) {
      user.storeName = resolvedStoreName;
    }

    const sellerId = user.sellerId || user._id.toString();
    let store = await Store.findOne({ sellerId });

    if (store) {
      if (resolvedStoreName) store.businessName = resolvedStoreName;
      if (name && name.trim()) store.ownerName = name.trim();
      if (mobile !== undefined) store.mobile = String(mobile).trim() || store.mobile;
      if (gstin !== undefined) store.gstin = String(gstin).trim();
      if (supportEmail && supportEmail.trim()) store.email = supportEmail.trim().toLowerCase();
      await store.save();
    } else if (resolvedStoreName) {
      store = await Store.create({
        ownerId: user._id,
        sellerId,
        businessName: resolvedStoreName,
        ownerName: user.name,
        mobile: (mobile && String(mobile).trim()) || 'Not set',
        email: (supportEmail && supportEmail.trim().toLowerCase()) || user.email,
        gstin: (gstin && String(gstin).trim()) || '',
        onboardingCompleted: true,
        status: 'active',
      });
      user.storeId = store._id;
      user.onboardingCompleted = true;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id.toString(),
        firebaseUid: user.firebaseUid || null,
        name: user.name,
        email: user.email,
        avatar: user.avatar || '',
        storeName: store?.businessName || user.storeName || '',
        role: user.role,
        storeId: user.storeId ? user.storeId.toString() : store ? store._id.toString() : null,
        sellerId,
        onboardingCompleted: Boolean(user.onboardingCompleted || (store && store.onboardingCompleted)),
      },
      store: store || null,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update profile' });
  }
};
