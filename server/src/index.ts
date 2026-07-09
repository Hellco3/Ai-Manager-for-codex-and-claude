import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config.js';
import { logger } from './utils/logger.js';
import taskRoutes from './routes/tasks.js';
import uploadRoutes from './routes/uploads.js';
import { sessionStore } from './store/session-store.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // Rate limiting: 30 requests/min per IP for general API
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api', generalLimiter);

  // Stricter rate limiting for uploads: 20 requests/min per IP
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}:${req.header('x-session-id') ?? 'anon'}`,
    message: { error: 'Upload rate limit exceeded' },
  });
  app.use('/api/uploads', uploadLimiter);

  // Request logging with request ID
  app.use((req, _res, next) => {
    const reqId = req.headers['x-request-id'] as string || crypto.randomUUID().slice(0, 8);
    (req as any).reqId = reqId;
    logger.info({ reqId, method: req.method, url: req.url }, '→');
    next();
  });

  // Routes
  app.use('/api', uploadRoutes);
  app.use('/api', taskRoutes);

  // Health check
  app.get('/health', (_req, res) => {
    const errors = validateConfig();
    res.json({
      status: errors.length === 0 ? 'ok' : 'degraded',
      configErrors: errors,
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
    });
  });

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: any) => {
    logger.error({ error: err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Start server if run directly
const app = createApp();
const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({ host: config.HOST, port: config.PORT }, 'Server started');
  const errors = validateConfig();
  if (errors.length > 0) {
    logger.warn({ errors }, 'Configuration issues detected');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await sessionStore.shutdown();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await sessionStore.shutdown();
  server.close(() => process.exit(0));
});
