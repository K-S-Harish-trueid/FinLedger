import { Router, type Response } from 'express';
import { z } from 'zod';
import { all, get, run, seedCategories, type DB } from '../db.ts';
import { config } from '../config.ts';
import {
  createDeviceSession,
  hashPassword,
  issueAccessToken,
  requireAuth,
  revokeDeviceSession,
  rotateDeviceSession,
  verifyPassword,
} from '../auth.ts';

const credentials = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
  deviceName: z.string().max(80).default('My phone'),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown'),
});

const registration = credentials.extend({ name: z.string().min(1).max(80) });

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  currency: string;
  monthly_email: number;
}

const publicUser = (user: UserRow): Record<string, unknown> => ({
  id: user.id,
  email: user.email,
  name: user.name,
  currency: user.currency,
  monthlyEmail: user.monthly_email === 1,
});

export const authRouter = (db: DB): Router => {
  const router = Router();

  router.post('/register', async (req, res: Response) => {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { email, password, name, deviceName, platform } = parsed.data;

    const existing = await get<{ id: string }>(db, `SELECT id FROM users WHERE email = ?`, [email]);
    if (existing) {
      res.status(409).json({ error: 'email_taken' });
      return;
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    await run(
      db,
      `INSERT INTO users (id, email, name, password_hash, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, email, name, await hashPassword(password), config.defaultCurrency, now],
    );
    await seedCategories(db, id, now);

    const session = await createDeviceSession(db, id, deviceName, platform);
    const user = await get<UserRow>(db, `SELECT * FROM users WHERE id = ?`, [id]);
    res.status(201).json({
      user: user ? publicUser(user) : { id, email, name },
      accessToken: issueAccessToken(id, session.deviceId),
      ...session,
    });
  });

  router.post('/login', async (req, res: Response) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { email, password, deviceName, platform } = parsed.data;
    const user = await get<UserRow>(db, `SELECT * FROM users WHERE email = ?`, [email]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    const session = await createDeviceSession(db, user.id, deviceName, platform);
    res.json({
      user: publicUser(user),
      accessToken: issueAccessToken(user.id, session.deviceId),
      ...session,
    });
  });

  router.post('/refresh', async (req, res: Response) => {
    const { deviceId, refreshToken } = req.body ?? {};
    if (typeof deviceId !== 'string' || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }
    const rotated = await rotateDeviceSession(db, deviceId, refreshToken);
    if (!rotated) {
      res.status(401).json({ error: 'invalid_refresh_token' });
      return;
    }
    res.json({
      accessToken: issueAccessToken(rotated.userId, deviceId),
      deviceId,
      refreshToken: rotated.refreshToken,
      expiresAt: rotated.expiresAt,
    });
  });

  router.post('/logout', requireAuth, async (req, res: Response) => {
    const { userId, deviceId } = req;
    await revokeDeviceSession(db, userId, deviceId);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res: Response) => {
    const { userId, deviceId } = req;
    const user = await get<UserRow>(db, `SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const devices = await all<{ id: string; name: string; platform: string; last_seen_at: number }>(
      db,
      `SELECT id, name, platform, last_seen_at FROM devices
       WHERE user_id = ? AND revoked = 0 ORDER BY last_seen_at DESC`,
      [userId],
    );
    res.json({
      user: publicUser(user),
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        platform: device.platform,
        lastSeenAt: device.last_seen_at,
        current: device.id === deviceId,
      })),
    });
  });

  router.patch('/me', requireAuth, async (req, res: Response) => {
    const { userId } = req;
    const parsed = z
      .object({
        name: z.string().min(1).max(80).optional(),
        currency: z.string().length(3).optional(),
        monthlyEmail: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { name, currency, monthlyEmail } = parsed.data;
    if (name !== undefined) await run(db, `UPDATE users SET name = ? WHERE id = ?`, [name, userId]);
    if (currency !== undefined) await run(db, `UPDATE users SET currency = ? WHERE id = ?`, [currency, userId]);
    if (monthlyEmail !== undefined) {
      await run(db, `UPDATE users SET monthly_email = ? WHERE id = ?`, [monthlyEmail ? 1 : 0, userId]);
    }
    const user = await get<UserRow>(db, `SELECT * FROM users WHERE id = ?`, [userId]);
    res.json({ user: user ? publicUser(user) : null });
  });

  router.delete('/devices/:id', requireAuth, async (req, res: Response) => {
    const { userId } = req;
    await revokeDeviceSession(db, userId, req.params.id as string);
    res.status(204).end();
  });

  return router;
};
