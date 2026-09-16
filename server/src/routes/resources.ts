import { Router, type Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { InValue } from '@libsql/client';
import { all, get, run, type DB } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { monthRange } from '../reports.ts';

const amount = z.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM');

/**
 * Field maps are the single source of truth for each resource: they drive
 * validation, the SQL column list, and the JSON shape sent to the app.
 * Keys are hardcoded here, never taken from request input, so the generated
 * SQL can never be influenced by a client.
 */
interface ResourceSpec {
  table: string;
  fields: Record<string, string>;
  create: ZodTypeAny;
  dateColumn: string;
  defaultOrder: string;
}

export const RESOURCES = {
  transactions: {
    table: 'transactions',
    fields: {
      type: 'type',
      amount: 'amount',
      categoryId: 'category_id',
      note: 'note',
      worth: 'worth',
      occurredOn: 'occurred_on',
    },
    create: z.object({
      type: z.enum(['income', 'expense']),
      amount,
      categoryId: z.string().nullable().default(null),
      note: z.string().max(280).default(''),
      worth: z.enum(['worth', 'not_worth']).nullable().default(null),
      occurredOn: isoDate,
    }),
    dateColumn: 'occurred_on',
    defaultOrder: 'occurred_on DESC, updated_at DESC',
  },
  savings: {
    table: 'savings',
    fields: {
      title: 'title',
      amount: 'amount',
      baseline: 'baseline',
      occurredOn: 'occurred_on',
    },
    create: z.object({
      title: z.string().min(1).max(120),
      amount,
      baseline: z.string().max(280).default(''),
      occurredOn: isoDate,
    }),
    dateColumn: 'occurred_on',
    defaultOrder: 'occurred_on DESC, updated_at DESC',
  },
  budgets: {
    table: 'budgets',
    fields: {
      categoryId: 'category_id',
      month: 'month',
      limitAmount: 'limit_amount',
    },
    create: z.object({
      categoryId: z.string().nullable().default(null),
      month: isoMonth,
      limitAmount: amount,
    }),
    dateColumn: 'month',
    defaultOrder: 'month DESC',
  },
  investments: {
    table: 'investments',
    fields: {
      amount: 'amount',
      instrument: 'instrument',
      note: 'note',
      forMonth: 'for_month',
      occurredOn: 'occurred_on',
    },
    create: z.object({
      amount,
      instrument: z.string().max(120).default(''),
      note: z.string().max(280).default(''),
      forMonth: isoMonth,
      occurredOn: isoDate,
    }),
    dateColumn: 'occurred_on',
    defaultOrder: 'occurred_on DESC',
  },
  categories: {
    table: 'categories',
    fields: {
      name: 'name',
      kind: 'kind',
      icon: 'icon',
      color: 'color',
    },
    create: z.object({
      name: z.string().min(1).max(60),
      kind: z.enum(['income', 'expense']),
      icon: z.string().max(40).default('circle'),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
    }),
    dateColumn: 'updated_at',
    defaultOrder: 'name ASC',
  },
} as const satisfies Record<string, ResourceSpec>;

export type ResourceName = keyof typeof RESOURCES;

export const toApi = (spec: ResourceSpec, row: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    id: row.id,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
  for (const [apiKey, column] of Object.entries(spec.fields)) out[apiKey] = row[column];
  return out;
};

const selectColumns = (spec: ResourceSpec): string =>
  ['id', 'updated_at', 'deleted', ...Object.values(spec.fields)].join(', ');

export const upsertResource = async (
  db: DB,
  spec: ResourceSpec,
  userId: string,
  id: string,
  values: Record<string, unknown>,
  updatedAt: number,
  deleted = false,
): Promise<void> => {
  const apiKeys = Object.keys(spec.fields);
  const columns = apiKeys.map((key) => spec.fields[key] as string);
  const args: InValue[] = apiKeys.map((key) => (values[key] ?? null) as InValue);
  const placeholders = columns.map(() => '?').join(', ');
  const assignments = columns.map((column) => `${column} = excluded.${column}`).join(', ');

  await run(
    db,
    `INSERT INTO ${spec.table} (id, user_id, ${columns.join(', ')}, updated_at, deleted)
     VALUES (?, ?, ${placeholders}, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ${assignments}, updated_at = excluded.updated_at, deleted = excluded.deleted
     WHERE ${spec.table}.user_id = excluded.user_id AND ${spec.table}.updated_at <= excluded.updated_at`,
    [id, userId, ...args, updatedAt, deleted ? 1 : 0],
  );
};

/**
 * Deletes touch only the tombstone columns. A delete arriving from another
 * device carries no field values, so it must never rewrite the row's data.
 */
export const softDeleteResource = async (
  db: DB,
  spec: ResourceSpec,
  userId: string,
  id: string,
  updatedAt: number,
): Promise<void> => {
  await run(
    db,
    `UPDATE ${spec.table} SET deleted = 1, updated_at = ?
     WHERE id = ? AND user_id = ? AND updated_at <= ?`,
    [updatedAt, id, userId, updatedAt],
  );
};

export const resourcesRouter = (db: DB): Router => {
  const router = Router();
  router.use(requireAuth);

  for (const [name, spec] of Object.entries(RESOURCES) as Array<[ResourceName, ResourceSpec]>) {
    const base = `/${name}`;

    router.get(base, async (req, res: Response) => {
      const { userId } = req;
      const clauses = [`user_id = ?`, `deleted = 0`];
      const args: InValue[] = [userId];

      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      if (month) {
        if (spec.dateColumn === 'month') {
          clauses.push(`month = ?`);
          args.push(month);
        } else {
          const { start, end } = monthRange(month);
          clauses.push(`${spec.dateColumn} >= ? AND ${spec.dateColumn} < ?`);
          args.push(start, end);
        }
      }
      if (name === 'transactions' && req.query.worth === 'not_worth') clauses.push(`worth = 'not_worth'`);

      const limit = Math.min(Number(req.query.limit ?? 500), 1000);
      const rows = await all<Record<string, unknown>>(
        db,
        `SELECT ${selectColumns(spec)} FROM ${spec.table}
         WHERE ${clauses.join(' AND ')} ORDER BY ${spec.defaultOrder} LIMIT ?`,
        [...args, limit],
      );
      res.json({ items: rows.map((row) => toApi(spec, row)) });
    });

    router.post(base, async (req, res: Response) => {
      const { userId } = req;
      const parsed = spec.create.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
        return;
      }
      const id = typeof req.body?.id === 'string' ? req.body.id : crypto.randomUUID();
      const now = Date.now();
      await upsertResource(db, spec, userId, id, parsed.data as Record<string, unknown>, now);
      const row = await get<Record<string, unknown>>(
        db,
        `SELECT ${selectColumns(spec)} FROM ${spec.table} WHERE id = ? AND user_id = ?`,
        [id, userId],
      );
      res.status(201).json(row ? toApi(spec, row) : { id });
    });

    router.patch(`${base}/:id`, async (req, res: Response) => {
      const { userId } = req;
      const existing = await get<Record<string, unknown>>(
        db,
        `SELECT ${selectColumns(spec)} FROM ${spec.table} WHERE id = ? AND user_id = ? AND deleted = 0`,
        [req.params.id, userId],
      );
      if (!existing) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const merged = { ...toApi(spec, existing), ...req.body };
      const parsed = spec.create.safeParse(merged);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
        return;
      }
      const now = Date.now();
      await upsertResource(db, spec, userId, req.params.id as string, parsed.data as Record<string, unknown>, now);
      const row = await get<Record<string, unknown>>(
        db,
        `SELECT ${selectColumns(spec)} FROM ${spec.table} WHERE id = ? AND user_id = ?`,
        [req.params.id, userId],
      );
      res.json(row ? toApi(spec, row) : {});
    });

    // Soft delete: the tombstone is what tells other devices the row is gone.
    router.delete(`${base}/:id`, async (req, res: Response) => {
      const { userId } = req;
      await run(db, `UPDATE ${spec.table} SET deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?`, [
        Date.now(),
        req.params.id,
        userId,
      ]);
      res.status(204).end();
    });
  }

  return router;
};
