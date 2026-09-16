import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';
import { get, run, type DB } from './db.ts';

export interface AuthedRequest extends Request {
  userId: string;
  deviceId: string;
}

interface AccessTokenClaims {
  sub: string;
  did: string;
}

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, 10);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(plain, hash);

export const issueAccessToken = (userId: string, deviceId: string): string =>
  jwt.sign({ sub: userId, did: deviceId } satisfies AccessTokenClaims, config.jwtSecret, {
    expiresIn: config.accessTokenTtlSeconds,
  });

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface DeviceSession {
  deviceId: string;
  refreshToken: string;
  expiresAt: number;
}

export const createDeviceSession = async (
  db: DB,
  userId: string,
  deviceName: string,
  platform: string,
): Promise<DeviceSession> => {
  const deviceId = crypto.randomUUID();
  const refreshToken = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  await run(
    db,
    `INSERT INTO devices (id, user_id, name, platform, token_hash, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [deviceId, userId, deviceName, platform, hashToken(refreshToken), now, now, expiresAt],
  );
  return { deviceId, refreshToken, expiresAt };
};

interface DeviceRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked: number;
}

/** Rotates the refresh token on every use so a stolen token dies on next refresh. */
export const rotateDeviceSession = async (
  db: DB,
  deviceId: string,
  refreshToken: string,
): Promise<{ userId: string; refreshToken: string; expiresAt: number } | null> => {
  const device = await get<DeviceRow>(db, `SELECT * FROM devices WHERE id = ?`, [deviceId]);
  if (!device || device.revoked === 1) return null;
  if (device.expires_at < Date.now()) return null;
  if (device.token_hash !== hashToken(refreshToken)) return null;

  const next = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  await run(db, `UPDATE devices SET token_hash = ?, last_seen_at = ?, expires_at = ? WHERE id = ?`, [
    hashToken(next),
    now,
    expiresAt,
    deviceId,
  ]);
  return { userId: device.user_id, refreshToken: next, expiresAt };
};

export const revokeDeviceSession = async (db: DB, userId: string, deviceId: string): Promise<void> => {
  await run(db, `UPDATE devices SET revoked = 1 WHERE id = ? AND user_id = ?`, [deviceId, userId]);
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  try {
    const claims = jwt.verify(header.slice(7), config.jwtSecret) as AccessTokenClaims;
    const authed = req as AuthedRequest;
    authed.userId = claims.sub;
    authed.deviceId = claims.did;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
};
