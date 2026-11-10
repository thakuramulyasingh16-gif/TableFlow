import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getEnv } from './config/env.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import guestRoutes from './routes/guestRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ registerExtraRoutes } = {}) {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  if (env.isProd) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...env.corsOrigins, 'https://api.razorpay.com'],
          frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    })
  );

  app.use(globalLimiter);
  app.use(cookieParser(env.COOKIE_SECRET));

  app.use('/api/webhooks', webhookRoutes);

  if (registerExtraRoutes?.beforeJson) {
    registerExtraRoutes.beforeJson(app);
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  // Serve uploaded menu images safely (never executable, nosniff)
  const uploadsDir = path.resolve(__dirname, '../uploads');
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      dotfiles: 'deny',
      index: false,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'tableflow-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/guest', guestRoutes);

  if (registerExtraRoutes?.afterAuth) {
    registerExtraRoutes.afterAuth(app);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
