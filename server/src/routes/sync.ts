import { Router, type Response } from 'express';
import { all, type DB } from '../db.ts';
import { requireAuth } from '../auth.ts';
import { RESOURCES, softDeleteResource, toApi, upsertResource, type ResourceName } from './resources.ts';

const RESOURCE_NAMES = Object.keys(RESOURCES) as ResourceName[];

const changesSince = async (db: DB, userId: string, since: number): Promise<Record<string, unknown[]>> => {
  const changes: Record<string, unknown[]> = {};
  for (const name of RESOURCE_NAMES) {
    const spec = RESOURCES[name];
    const columns = ['id', 'updated_at', 'deleted', ...Object.values(spec.fields)].join(', ');
    const rows = await all<Record<string, unknown>>(
      db,
      `SELECT ${columns} FROM ${spec.table} WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT 5000`,
      [userId, since],
    );
    changes[name] = rows.map((row) => toApi(spec, row));
  }
  return changes;
};

/**
 * Delta sync with last-write-wins. Devices create their own row ids, push what
 * changed locally, and pull everything touched since their last cursor. The
 * upsert itself drops any incoming row that is older than the stored one, so
 * two devices editing offline converge without a server round of conflict UI.
 */
export const syncRouter = (db: DB): Router => {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res: Response) => {
    const { userId } = req;
    const since = Number(req.query.since ?? 0);
    res.json({ serverTime: Date.now(), changes: await changesSince(db, userId, Number.isFinite(since) ? since : 0) });
  });

  router.post('/', async (req, res: Response) => {
    const { userId } = req;
    const since = Number(req.body?.since ?? 0);
    const incoming = (req.body?.changes ?? {}) as Record<string, unknown>;
    const rejected: Array<{ resource: string; id: unknown; reason: string }> = [];

    for (const name of RESOURCE_NAMES) {
      const batch = incoming[name];
      if (!Array.isArray(batch)) continue;
      const spec = RESOURCES[name];

      for (const item of batch) {
        const row = item as Record<string, unknown>;
        if (typeof row.id !== 'string') {
          rejected.push({ resource: name, id: row.id, reason: 'missing_id' });
          continue;
        }
        const deleted = row.deleted === true;
        const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : Date.now();

        // A tombstone carries no field values to validate or write.
        if (deleted) {
          await softDeleteResource(db, spec, userId, row.id, updatedAt);
          continue;
        }
        const parsed = spec.create.safeParse(row);
        if (!parsed.success) {
          rejected.push({ resource: name, id: row.id, reason: 'invalid_body' });
          continue;
        }
        await upsertResource(db, spec, userId, row.id, parsed.data as Record<string, unknown>, updatedAt, false);
      }
    }

    res.json({
      serverTime: Date.now(),
      rejected,
      changes: await changesSince(db, userId, Number.isFinite(since) ? since : 0),
    });
  });

  return router;
};
