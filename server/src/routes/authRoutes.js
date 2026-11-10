import { Router } from 'express';
import { getCsrfToken, login, logout, me, refresh } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { loginLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../validators/authValidators.js';

const router = Router();

router.get('/csrf-token', getCsrfToken);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', requireCsrf, refresh);
router.post('/logout', requireCsrf, logout);
router.get('/me', requireAuth, me);

export default router;
