import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { facilitatorRouter } from './routes/facilitator.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { resolveFacilitator } from './middleware/tenant.js';

/**
 * Get allowed CORS origins from environment or defaults
 */
function getCorsOrigins(): string[] {
  const dashboardUrl = process.env.DASHBOARD_URL;
  
  // Default origins for development
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:5001',
  ];

  // Production origins
  const productionOrigins = [
    'https://openfacilitator.io',
    'https://www.openfacilitator.io',
    'https://dashboard.openfacilitator.io',
    'https://openfacilitator-dashboard.vercel.app',
    'https://api.openfacilitator.io',
  ];

  // Add custom dashboard URL if set
  if (dashboardUrl) {
    return [...defaultOrigins, ...productionOrigins, dashboardUrl];
  }

  return [...defaultOrigins, ...productionOrigins];
}

/**
 * Create the Express server with all middleware and routes
 */
export function createServer(): Express {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
    })
  );
  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: true,
    })
  );
  app.use(express.json());

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth routes (handled by Better Auth)
  app.use('/api/auth', authRouter);

  // Admin API routes (for dashboard)
  app.use('/api/admin', adminRouter);

  // Subscription routes (for Memeputer agent integration)
  app.use('/api/subscriptions', subscriptionsRouter);

  // Public free facilitator routes (no auth required)
  app.use('/', publicRouter);

  // Multi-tenant facilitator routes
  // These are resolved by subdomain or custom domain
  app.use('/', resolveFacilitator, facilitatorRouter);

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  return app;
}

