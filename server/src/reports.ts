import { all, get, type DB } from './db.ts';

/** `2026-09` -> `['2026-09-01', '2026-10-01')`, a half-open range the date indexes can use. */
export const monthRange = (month: string): { start: string; end: string } => {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const index = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(index) || index < 1 || index > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  const nextYear = index === 12 ? year + 1 : year;
  const nextIndex = index === 12 ? 1 : index + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return { start: `${year}-${pad(index)}-01`, end: `${nextYear}-${pad(nextIndex)}-01` };
};

export const currentMonth = (at: Date = new Date()): string =>
  `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;

export const previousMonth = (month: string): string => {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const index = Number(monthText);
  const prevYear = index === 1 ? year - 1 : year;
  const prevIndex = index === 1 ? 12 : index - 1;
  return `${prevYear}-${String(prevIndex).padStart(2, '0')}`;
};

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  color: string;
  amount: number;
}

export interface LeakItem {
  id: string;
  note: string;
  amount: number;
  occurredOn: string;
  category: string;
}

export interface SavingItem {
  id: string;
  title: string;
  amount: number;
  baseline: string;
  occurredOn: string;
}

export interface BudgetProgress {
  categoryId: string | null;
  name: string;
  limit: number;
  spent: number;
  remaining: number;
  usedPercent: number;
}

export interface DailyPoint {
  date: string;
  saved: number;
  leaked: number;
  net: number;
}

export interface MonthlyReport {
  month: string;
  currency: string;
  income: number;
  expense: number;
  netCash: number;
  saved: number;
  leaked: number;
  netGain: number;
  status: 'green' | 'red' | 'flat';
  investSuggestion: number;
  invested: number;
  savingStreakDays: number;
  spendByCategory: CategorySlice[];
  topLeaks: LeakItem[];
  topSavings: SavingItem[];
  budgets: BudgetProgress[];
  daily: DailyPoint[];
}

const sumOf = (rows: Array<{ total: number | null }>): number => rows[0]?.total ?? 0;

export const buildMonthlyReport = async (db: DB, userId: string, month: string): Promise<MonthlyReport> => {
  const { start, end } = monthRange(month);
  const window = [userId, start, end];

  const user = await get<{ currency: string }>(db, `SELECT currency FROM users WHERE id = ?`, [userId]);

  const income = sumOf(
    await all<{ total: number | null }>(
      db,
      `SELECT SUM(amount) AS total FROM transactions
       WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ? AND type = 'income' AND deleted = 0`,
      window,
    ),
  );

  const expense = sumOf(
    await all<{ total: number | null }>(
      db,
      `SELECT SUM(amount) AS total FROM transactions
       WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ? AND type = 'expense' AND deleted = 0`,
      window,
    ),
  );

  const saved = sumOf(
    await all<{ total: number | null }>(
      db,
      `SELECT SUM(amount) AS total FROM savings
       WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ? AND deleted = 0`,
      window,
    ),
  );

  const leaked = sumOf(
    await all<{ total: number | null }>(
      db,
      `SELECT SUM(amount) AS total FROM transactions
       WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ?
         AND type = 'expense' AND worth = 'not_worth' AND deleted = 0`,
      window,
    ),
  );

  const invested = sumOf(
    await all<{ total: number | null }>(
      db,
      `SELECT SUM(amount) AS total FROM investments WHERE user_id = ? AND for_month = ? AND deleted = 0`,
      [userId, month],
    ),
  );

  const spendByCategory = (
    await all<{ category_id: string | null; name: string | null; color: string | null; amount: number }>(
      db,
      `SELECT t.category_id, c.name, c.color, SUM(t.amount) AS amount
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.occurred_on >= ? AND t.occurred_on < ?
         AND t.type = 'expense' AND t.deleted = 0
       GROUP BY t.category_id
       ORDER BY amount DESC`,
      window,
    )
  ).map((row) => ({
    categoryId: row.category_id,
    name: row.name ?? 'Uncategorised',
    color: row.color ?? '#64748b',
    amount: row.amount,
  }));

  const topLeaks = (
    await all<{ id: string; note: string; amount: number; occurred_on: string; name: string | null }>(
      db,
      `SELECT t.id, t.note, t.amount, t.occurred_on, c.name
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.occurred_on >= ? AND t.occurred_on < ?
         AND t.type = 'expense' AND t.worth = 'not_worth' AND t.deleted = 0
       ORDER BY t.amount DESC
       LIMIT 10`,
      window,
    )
  ).map((row) => ({
    id: row.id,
    note: row.note,
    amount: row.amount,
    occurredOn: row.occurred_on,
    category: row.name ?? 'Uncategorised',
  }));

  const topSavings = (
    await all<{ id: string; title: string; amount: number; baseline: string; occurred_on: string }>(
      db,
      `SELECT id, title, amount, baseline, occurred_on FROM savings
       WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ? AND deleted = 0
       ORDER BY amount DESC LIMIT 10`,
      window,
    )
  ).map((row) => ({
    id: row.id,
    title: row.title,
    amount: row.amount,
    baseline: row.baseline,
    occurredOn: row.occurred_on,
  }));

  const budgets = await all<{
    category_id: string | null;
    limit_amount: number;
    name: string | null;
    spent: number | null;
  }>(
    db,
    `SELECT b.category_id, b.limit_amount, c.name,
            (SELECT SUM(t.amount) FROM transactions t
              WHERE t.user_id = b.user_id AND t.type = 'expense' AND t.deleted = 0
                AND t.occurred_on >= ? AND t.occurred_on < ?
                AND (b.category_id IS NULL OR t.category_id = b.category_id)) AS spent
     FROM budgets b
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE b.user_id = ? AND b.month = ? AND b.deleted = 0`,
    [start, end, userId, month],
  );

  const daily = await all<{ date: string; saved: number; leaked: number }>(
    db,
    `SELECT date, SUM(saved) AS saved, SUM(leaked) AS leaked FROM (
        SELECT occurred_on AS date, amount AS saved, 0 AS leaked FROM savings
          WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ? AND deleted = 0
        UNION ALL
        SELECT occurred_on AS date, 0 AS saved, amount AS leaked FROM transactions
          WHERE user_id = ? AND occurred_on >= ? AND occurred_on < ?
            AND type = 'expense' AND worth = 'not_worth' AND deleted = 0
     )
     GROUP BY date ORDER BY date ASC`,
    [...window, ...window],
  );

  const netGain = saved - leaked;

  return {
    month,
    currency: user?.currency ?? 'INR',
    income,
    expense,
    netCash: income - expense,
    saved,
    leaked,
    netGain,
    status: netGain > 0 ? 'green' : netGain < 0 ? 'red' : 'flat',
    investSuggestion: Math.max(netGain - invested, 0),
    invested,
    savingStreakDays: await savingStreak(db, userId),
    spendByCategory,
    topLeaks,
    topSavings,
    budgets: budgets.map((row) => {
      const spent = row.spent ?? 0;
      return {
        categoryId: row.category_id,
        name: row.name ?? 'Overall',
        limit: row.limit_amount,
        spent,
        remaining: row.limit_amount - spent,
        usedPercent: row.limit_amount === 0 ? 0 : Math.round((spent / row.limit_amount) * 100),
      };
    }),
    daily: daily.map((row) => ({
      date: row.date,
      saved: row.saved,
      leaked: row.leaked,
      net: row.saved - row.leaked,
    })),
  };
};

/** Consecutive days ending today (or yesterday) on which at least one saving was logged. */
export const savingStreak = async (db: DB, userId: string, today: Date = new Date()): Promise<number> => {
  const days = await all<{ occurred_on: string }>(
    db,
    `SELECT DISTINCT occurred_on FROM savings
     WHERE user_id = ? AND deleted = 0 ORDER BY occurred_on DESC LIMIT 400`,
    [userId],
  );
  const logged = new Set(days.map((row) => row.occurred_on));
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (d: Date): string => d.toISOString().slice(0, 10);

  // A streak stays alive until today is over, so start from yesterday if today is blank.
  if (!logged.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (logged.has(iso(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};
