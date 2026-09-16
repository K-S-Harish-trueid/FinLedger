import { createClient, type Client, type InValue } from '@libsql/client';
import { config } from './config.ts';

export type DB = Client;

/**
 * Schema is plain SQLite DDL so the same statements run against a local file in
 * development and against the hosted libSQL database in production.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR',
  monthly_email INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'unknown',
  token_hash    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('income','expense')),
  icon       TEXT NOT NULL DEFAULT 'circle',
  color      TEXT NOT NULL DEFAULT '#6366f1',
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id, updated_at);

CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  category_id TEXT,
  note        TEXT NOT NULL DEFAULT '',
  worth       TEXT CHECK (worth IN ('worth','not_worth')),
  occurred_on TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_tx_user_updated ON transactions(user_id, updated_at);

CREATE TABLE IF NOT EXISTS savings (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount >= 0),
  baseline     TEXT NOT NULL DEFAULT '',
  occurred_on  TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_savings_user_date ON savings(user_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_savings_user_updated ON savings(user_id, updated_at);

CREATE TABLE IF NOT EXISTS budgets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  TEXT,
  month        TEXT NOT NULL,
  limit_amount INTEGER NOT NULL CHECK (limit_amount >= 0),
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS idx_budgets_user_updated ON budgets(user_id, updated_at);

CREATE TABLE IF NOT EXISTS investments (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  instrument  TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  for_month   TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_investments_user_month ON investments(user_id, for_month);
CREATE INDEX IF NOT EXISTS idx_investments_user_updated ON investments(user_id, updated_at);

CREATE TABLE IF NOT EXISTS sent_reports (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month   TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, month)
);
`;

const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; kind: 'income' | 'expense'; icon: string; color: string }> = [
  { name: 'Salary', kind: 'income', icon: 'briefcase', color: '#16a34a' },
  { name: 'Other income', kind: 'income', icon: 'plus-circle', color: '#0ea5e9' },
  { name: 'Food', kind: 'expense', icon: 'utensils', color: '#f97316' },
  { name: 'Travel', kind: 'expense', icon: 'bus', color: '#6366f1' },
  { name: 'Rent', kind: 'expense', icon: 'home', color: '#a855f7' },
  { name: 'Bills', kind: 'expense', icon: 'zap', color: '#eab308' },
  { name: 'Shopping', kind: 'expense', icon: 'shopping-bag', color: '#ec4899' },
  { name: 'Health', kind: 'expense', icon: 'heart', color: '#ef4444' },
  { name: 'Other', kind: 'expense', icon: 'circle', color: '#64748b' },
];

export const openDb = async (url: string = config.databaseUrl): Promise<DB> => {
  const db = createClient({
    url,
    authToken: config.databaseAuthToken,
    intMode: 'number',
  });
  await db.executeMultiple('PRAGMA foreign_keys = ON;');
  await db.executeMultiple(SCHEMA);
  return db;
};

export const all = async <T>(db: DB, sql: string, args: InValue[] = []): Promise<T[]> => {
  const result = await db.execute({ sql, args });
  return result.rows as unknown as T[];
};

export const get = async <T>(db: DB, sql: string, args: InValue[] = []): Promise<T | undefined> => {
  const rows = await all<T>(db, sql, args);
  return rows[0];
};

export const run = async (db: DB, sql: string, args: InValue[] = []): Promise<void> => {
  await db.execute({ sql, args });
};

export const seedCategories = async (db: DB, userId: string, now: number): Promise<void> => {
  await db.batch(
    DEFAULT_CATEGORIES.map((category) => ({
      sql: `INSERT INTO categories (id, user_id, name, kind, icon, color, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), userId, category.name, category.kind, category.icon, category.color, now],
    })),
    'write',
  );
};
