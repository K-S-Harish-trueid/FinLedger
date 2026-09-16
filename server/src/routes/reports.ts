import { Router, type Response } from 'express';
import { get, type DB } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { buildMonthlyReport, currentMonth, previousMonth } from '../reports.ts';
import { sendMonthlyEmail } from '../mailer.ts';

export const reportsRouter = (db: DB): Router => {
  const router = Router();
  router.use(requireAuth);

  router.get('/monthly', async (req, res: Response) => {
    const { userId } = req;
    const month = typeof req.query.month === 'string' ? req.query.month : currentMonth();
    try {
      res.json(await buildMonthlyReport(db, userId, month));
    } catch {
      res.status(400).json({ error: 'invalid_month' });
    }
  });

  /** Dashboard payload: this month next to last month, so the app can show the trend. */
  router.get('/summary', async (req, res: Response) => {
    const { userId } = req;
    const month = typeof req.query.month === 'string' ? req.query.month : currentMonth();
    try {
      const [thisMonth, lastMonth] = await Promise.all([
        buildMonthlyReport(db, userId, month),
        buildMonthlyReport(db, userId, previousMonth(month)),
      ]);
      res.json({ current: thisMonth, previous: lastMonth });
    } catch {
      res.status(400).json({ error: 'invalid_month' });
    }
  });

  router.post('/email', async (req, res: Response) => {
    const { userId } = req;
    const month = typeof req.body?.month === 'string' ? req.body.month : previousMonth(currentMonth());
    const user = await get<{ email: string; name: string }>(db, `SELECT email, name FROM users WHERE id = ?`, [userId]);
    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    try {
      await sendMonthlyEmail(user.email, user.name, await buildMonthlyReport(db, userId, month));
      res.json({ sent: true, month, to: user.email });
    } catch (error) {
      res.status(502).json({ error: 'send_failed', message: (error as Error).message });
    }
  });

  return router;
};
