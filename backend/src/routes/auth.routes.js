import express from 'express';
import { loginUser, registerUser, getMe } from '../modules/users/user.controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register', registerUser);
router.get('/me', authMiddleware, getMe);

export default router;
