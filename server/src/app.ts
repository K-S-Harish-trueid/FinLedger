import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { DB } from './db.ts';
import { config } from './config.ts';
import { authRouter } from './routes/auth.ts';
import { resourcesRouter } from './routes/resources.ts';
import { syncRouter } from './routes/sync.ts';
import { reportsRouter } from './routes/reports.ts';
import { sendDueMonthlyReports } from './scheduler.ts';

export const createApp = (db: DB): Express => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  /**
   * Free hosting tiers sleep an idle service, so the in-process hourly timer
   * cannot be trusted to fire at month end. An external scheduler hits this
   * instead; `sendDueMonthlyReports` is idempotent, so calling it daily is safe.
   */
  app.post('/api/cron/monthly-reports', async (req, res) => {
    if (!config.cronSecret || req.header('x-cron-secret') !== config.cronSecret) {
      res.status(401).json({ error: 'unauthorised' });
      return;
    }
    res.json({ sent: await sendDueMonthlyReports(db) });
  });
  app.use('/api/auth', authRouter(db));
  app.use('/api/sync', syncRouter(db));
  app.use('/api/reports', reportsRouter(db));
  app.use('/api', resourcesRouter(db));

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'server_error' });
  });

  return app;
};
