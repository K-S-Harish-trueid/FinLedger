import { currentMonth } from './money';

export interface Saving {
  id: string;
  title: string;
  amount: number;
  baseline: string;
  occurredOn: string;
  updatedAt: number;
  deleted: boolean;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  categoryId: string | null;
  note: string;
  worth: 'worth' | 'not_worth' | null;
  occurredOn: string;
  updatedAt: number;
  deleted: boolean;
}

export interface Budget {
  id: string;
  categoryId: string | null;
  month: string;
  limitAmount: number;
  updatedAt: number;
  deleted: boolean;
}

export interface Investment {
  id: string;
  amount: number;
  instrument: string;
  note: string;
  forMonth: string;
  occurredOn: string;
  updatedAt: number;
  deleted: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  icon: string;
  color: string;
  updatedAt: number;
  deleted: boolean;
}

export interface Snapshot {
  month: string;
  saved: number;
  leaked: number;
  netGain: number;
  status: 'green' | 'red' | 'flat';
  income: number;
  expense: number;
  netCash: number;
  invested: number;
  investSuggestion: number;
  streak: number;
}

const inMonth = (iso: string, month: string): boolean => iso.startsWith(month);

const live = <T extends { deleted: boolean }>(rows: T[]): T[] => rows.filter((row) => !row.deleted);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * The same arithmetic the server uses for the emailed statement, run locally so
 * the dashboard is correct the instant an entry is added and while offline.
 */
export const buildSnapshot = (
  data: { savings: Saving[]; transactions: Transaction[]; investments: Investment[] },
  month: string = currentMonth(),
): Snapshot => {
  const savings = live(data.savings).filter((row) => inMonth(row.occurredOn, month));
  const transactions = live(data.transactions).filter((row) => inMonth(row.occurredOn, month));
  const investments = live(data.investments).filter((row) => row.forMonth === month);

  const saved = sum(savings.map((row) => row.amount));
  const leaked = sum(
    transactions.filter((row) => row.type === 'expense' && row.worth === 'not_worth').map((row) => row.amount),
  );
  const income = sum(transactions.filter((row) => row.type === 'income').map((row) => row.amount));
  const expense = sum(transactions.filter((row) => row.type === 'expense').map((row) => row.amount));
  const invested = sum(investments.map((row) => row.amount));
  const netGain = saved - leaked;

  return {
    month,
    saved,
    leaked,
    netGain,
    status: netGain > 0 ? 'green' : netGain < 0 ? 'red' : 'flat',
    income,
    expense,
    netCash: income - expense,
    invested,
    investSuggestion: Math.max(netGain - invested, 0),
    streak: savingStreak(data.savings),
  };
};

/** Consecutive days ending today (or yesterday) with at least one saving logged. */
export const savingStreak = (savings: Saving[], today: Date = new Date()): number => {
  const logged = new Set(live(savings).map((row) => row.occurredOn));
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (date: Date): string => date.toISOString().slice(0, 10);

  if (!logged.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (logged.has(iso(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};

export interface BudgetProgress {
  id: string;
  name: string;
  limit: number;
  spent: number;
  remaining: number;
  usedPercent: number;
}

export const budgetProgress = (
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  month: string,
): BudgetProgress[] =>
  live(budgets)
    .filter((budget) => budget.month === month)
    .map((budget) => {
      const spent = sum(
        live(transactions)
          .filter(
            (row) =>
              row.type === 'expense' &&
              inMonth(row.occurredOn, month) &&
              (budget.categoryId === null || row.categoryId === budget.categoryId),
          )
          .map((row) => row.amount),
      );
      const name = budget.categoryId
        ? (categories.find((category) => category.id === budget.categoryId)?.name ?? 'Category')
        : 'Everything';
      return {
        id: budget.id,
        name,
        limit: budget.limitAmount,
        spent,
        remaining: budget.limitAmount - spent,
        usedPercent: budget.limitAmount === 0 ? 0 : Math.round((spent / budget.limitAmount) * 100),
      };
    });

export const spendByCategory = (
  transactions: Transaction[],
  categories: Category[],
  month: string,
): Array<{ name: string; color: string; amount: number }> => {
  const totals = new Map<string, number>();
  for (const row of live(transactions)) {
    if (row.type !== 'expense' || !inMonth(row.occurredOn, month)) continue;
    const key = row.categoryId ?? 'none';
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([key, amount]) => {
      const category = categories.find((item) => item.id === key);
      return { name: category?.name ?? 'Uncategorised', color: category?.color ?? '#64748b', amount };
    })
    .sort((a, b) => b.amount - a.amount);
};

export const groupByDay = <T extends { occurredOn: string }>(rows: T[]): Array<[string, T[]]> => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = groups.get(row.occurredOn) ?? [];
    bucket.push(row);
    groups.set(row.occurredOn, bucket);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
};
