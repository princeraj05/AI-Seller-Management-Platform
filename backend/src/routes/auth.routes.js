import express from 'express';
import {
  loginUser,
  loginWithGoogle,
  registerUser,
  refreshAccessToken,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getMe,
  updateMe,
} from '../modules/users/user.controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { csrfProtection } from '../middleware/csrfMiddleware.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.post('/login', authLimiter, csrfProtection, loginUser);
router.post('/google', authLimiter, csrfProtection, loginWithGoogle);
router.post('/register', authLimiter, csrfProtection, registerUser);
router.post('/refresh', authLimiter, csrfProtection, refreshAccessToken);
router.post('/logout', csrfProtection, logoutUser);
router.post('/request-password-reset', passwordResetLimiter, csrfProtection, requestPasswordReset);
router.post('/reset-password', passwordResetLimiter, csrfProtection, resetPassword);
router.post('/change-password', passwordResetLimiter, csrfProtection, authMiddleware, changePassword);
router.get('/me', authMiddleware, getMe);
router.put('/me', csrfProtection, authMiddleware, updateMe);

export default router;
