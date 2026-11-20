import mongoose from 'mongoose';
import { User } from './user.model.js';
import { Store } from '../onboarding/store.model.js';
import { RefreshToken } from './refreshToken.model.js';
import { adminAuth } from '../../config/firebase.js';
import {
  generateAccessToken,
  generateRefreshToken,
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

    const { uid, email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google account does not provide an email address',
        code: 'EMAIL_REQUIRED',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find or auto-provision user in MongoDB
    let user = await User.findOne({
      $or: [{ firebaseUid: uid }, { email: normalizedEmail }],
    });

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
      let shouldSave = false;
      if (!user.firebaseUid) {
        user.firebaseUid = uid;
        shouldSave = true;
      }
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
 * @desc    Reset password (with bcrypt hashing) for migration or credential update
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required',
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    // If account has an existing bcrypt password, require current password verification
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to update password',
        });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password does not match',
        });
      }
    }
    // If account has a legacy plaintext password and currentPassword was supplied, verify it
    else if (user.password && currentPassword) {
      if (user.password !== currentPassword) {
        return res.status(401).json({
          success: false,
          message: 'Current password does not match',
        });
      }
    }

    // Set new password (pre-save hook will hash with bcrypt)
    user.password = newPassword;
    user.mustResetPassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate all prior sessions
    await user.save();

    // Revoke all existing refresh tokens for this user
    await RefreshToken.updateMany({ userId: user._id }, { $set: { isRevoked: true } });

    clearRefreshTokenCookie(res);

    return res.status(200).json({
      success: true,
      message: 'Password updated and hashed successfully. Please sign in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during password reset',
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
