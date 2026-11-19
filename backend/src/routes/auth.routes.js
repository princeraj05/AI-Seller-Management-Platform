import express from 'express';
import {
  loginUser,
  loginWithGoogle,
  registerUser,
  refreshAccessToken,
  logoutUser,
  resetPassword,
  getMe,
} from '../modules/users/user.controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { csrfProtection } from '../middleware/csrfMiddleware.js';

const router = express.Router();

router.post('/login', csrfProtection, loginUser);
router.post('/google', csrfProtection, loginWithGoogle);
router.post('/register', csrfProtection, registerUser);
router.post('/refresh', csrfProtection, refreshAccessToken);
router.post('/logout', csrfProtection, logoutUser);
router.post('/reset-password', csrfProtection, resetPassword);
router.get('/me', authMiddleware, getMe);

export default router;
