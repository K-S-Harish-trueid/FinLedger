import { all, get, run, type DB } from './db.ts';
import { sendMonthlyEmail } from './mailer.ts';
import { buildMonthlyReport, currentMonth, previousMonth } from './reports.ts';

const HOUR = 60 * 60 * 1000;

/**
 * Sends each opted-in user their statement for the month that just closed.
 * `sent_reports` makes this idempotent, so running it every hour (or twice
 * after a restart) still results in exactly one email per user per month.
 */
export const sendDueMonthlyReports = async (db: DB, now: Date = new Date()): Promise<number> => {
  const month = previousMonth(currentMonth(now));
  const users = await all<{ id: string; email: string; name: string }>(
    db,
    `SELECT u.id, u.email, u.name FROM users u
     WHERE u.monthly_email = 1
       AND NOT EXISTS (SELECT 1 FROM sent_reports r WHERE r.user_id = u.id AND r.month = ?)`,
    [month],
  );

  let sent = 0;
  for (const user of users) {
    try {
      const report = await buildMonthlyReport(db, user.id, month);
      await sendMonthlyEmail(user.email, user.name, report);
      await run(db, `INSERT OR REPLACE INTO sent_reports (user_id, month, sent_at) VALUES (?, ?, ?)`, [
        user.id,
        month,
        Date.now(),
      ]);
      sent += 1;
    } catch (error) {
      console.error(`monthly report failed for ${user.id}:`, (error as Error).message);
    }
  }
  return sent;
};

export const startScheduler = (db: DB): NodeJS.Timeout => {
  const tick = (): void => {
    void sendDueMonthlyReports(db).then((sent) => {
      if (sent > 0) console.log(`sent ${sent} monthly report(s)`);
    });
  };
  tick();
  return setInterval(tick, HOUR);
};

export const hasSentReport = async (db: DB, userId: string, month: string): Promise<boolean> =>
  Boolean(await get<{ month: string }>(db, `SELECT month FROM sent_reports WHERE user_id = ? AND month = ?`, [userId, month]));
