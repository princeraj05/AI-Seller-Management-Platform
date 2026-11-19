import api from './api';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

/**
 * Log in seller with email and password
 */
export const loginApi = async (email, password) => {
  try {
    const response = await api.post('/auth/login', {
      email,
      password,
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      const err = new Error(error.response.data.message || 'Login failed');
      err.code = error.response.data.code;
      throw err;
    }
    throw new Error(error.message || 'Network error during login');
  }
};

/**
 * Log in / authenticate with Google Firebase ID token to obtain platform JWT access + refresh tokens
 */
export const googleLoginApi = async (idToken) => {
  try {
    const response = await api.post('/auth/google', { idToken });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      const err = new Error(error.response.data.message || 'Google authentication failed');
      err.code = error.response.data.code;
      throw err;
    }
    throw new Error(error.message || 'Network error during Google authentication');
  }
};

/**
 * Register a new seller account
 */
export const registerApi = async (userData) => {
  try {
    const response = await api.post('/auth/register', userData);
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Registration failed');
    }
    throw new Error(error.message || 'Network error during registration');
  }
};

/**
 * Manually trigger refresh token using HttpOnly cookie credentials
 */
export const refreshApi = async () => {
  try {
    const response = await api.post('/auth/refresh', {});
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Token refresh failed');
    }
    throw new Error(error.message || 'Network error during token refresh');
  }
};

/**
 * Log out and revoke session on backend (clearing HttpOnly cookie and database record) and Firebase
 */
export const logoutApi = async () => {
  try {
    await api.post('/auth/logout', {});
  } catch (err) {
    console.warn('Logout API notification warning:', err.message);
  } finally {
    try {
      if (auth?.currentUser) {
        await signOut(auth);
      }
    } catch (fbErr) {
      console.warn('Firebase signout warning:', fbErr.message);
    }
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    sessionStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('store');
    localStorage.removeItem('onboardingCompleted');
  }
};

/**
 * Reset password (used for migration or credential changes)
 */
export const resetPasswordApi = async ({ email, currentPassword, newPassword }) => {
  try {
    const response = await api.post('/auth/reset-password', {
      email,
      currentPassword,
      newPassword,
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Password reset failed');
    }
    throw new Error(error.message || 'Network error during password reset');
  }
};

/**
 * Get current authenticated user profile
 */
export const getMeApi = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.message || 'Failed to fetch user profile');
    }
    throw new Error(error.message || 'Network error fetching user profile');
  }
};
