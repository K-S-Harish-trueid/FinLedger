import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { all, openDb, type DB } from './db.ts';
import { formatInr, rupeesToPaise } from './money.ts';
import { buildMonthlyReport, monthRange, previousMonth, savingStreak } from './reports.ts';
import { renderMonthlyEmail } from './mailer.ts';
import { sendDueMonthlyReports } from './scheduler.ts';

let db: DB;
let server: Server;
let base: string;

const api = async (
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: any }> => {
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

const register = async (email: string, deviceName = 'Phone') => {
  const { body } = await api('/api/auth/register', {
    method: 'POST',
    body: { email, password: 'supersecret123', name: 'Harish', deviceName, platform: 'android' },
  });
  return body as { accessToken: string; refreshToken: string; deviceId: string; user: { id: string } };
};

before(async () => {
  db = await openDb(':memory:');
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

after(() => {
  server.close();
});

describe('money', () => {
  it('formats rupees with Indian digit grouping', () => {
    assert.equal(formatInr(rupeesToPaise(1234567)), '₹12,34,567.00');
    assert.equal(formatInr(rupeesToPaise(999)), '₹999.00');
    assert.equal(formatInr(rupeesToPaise(-45.5)), '-₹45.50');
  });
});

describe('month helpers', () => {
  it('builds a half-open range and rolls over December', () => {
    assert.deepEqual(monthRange('2026-09'), { start: '2026-09-01', end: '2026-10-01' });
    assert.deepEqual(monthRange('2026-12'), { start: '2026-12-01', end: '2027-01-01' });
    assert.equal(previousMonth('2026-01'), '2025-12');
  });
});

describe('auth', () => {
  it('registers, rejects a duplicate email, and logs in', async () => {
    const created = await register('harish@example.com');
    assert.ok(created.accessToken);

    const duplicate = await api('/api/auth/register', {
      method: 'POST',
      body: { email: 'harish@example.com', password: 'supersecret123', name: 'Other' },
    });
    assert.equal(duplicate.status, 409);

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'harish@example.com', password: 'supersecret123' },
    });
    assert.equal(login.status, 200);

    const bad = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'harish@example.com', password: 'wrongpassword' },
    });
    assert.equal(bad.status, 401);
  });

  it('seeds starter categories for a new account', async () => {
    const user = await register('cats@example.com');
    const { body } = await api('/api/categories', { token: user.accessToken });
    assert.ok(body.items.length >= 8);
    assert.ok(body.items.some((c: any) => c.name === 'Travel' && c.kind === 'expense'));
  });

  it('refuses requests without a token', async () => {
    const { status } = await api('/api/transactions');
    assert.equal(status, 401);
  });

  it('deletes an account and everything in it, but only with the password', async () => {
    const user = await register('delete-me@example.com');
    const token = user.accessToken;
    await api('/api/savings', {
      method: 'POST',
      token,
      body: { title: 'Goes away', amount: rupeesToPaise(10), occurredOn: '2026-09-04' },
    });

    const wrong = await api('/api/auth/me', { method: 'DELETE', token, body: { password: 'nope' } });
    assert.equal(wrong.status, 401);

    const removed = await api('/api/auth/me', {
      method: 'DELETE',
      token,
      body: { password: 'supersecret123' },
    });
    assert.equal(removed.status, 204);

    // The account is gone, and so is the row that belonged to it.
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'delete-me@example.com', password: 'supersecret123' },
    });
    assert.equal(login.status, 401);
    const orphans = await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM savings WHERE user_id = ?`, [
      user.user.id,
    ]);
    assert.equal(orphans[0]?.n, 0);
  });

  it('rotates the refresh token and keeps devices independent', async () => {
    const phone = await register('multi@example.com', 'Phone');
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'multi@example.com', password: 'supersecret123', deviceName: 'Tablet' },
    });
    assert.notEqual(login.body.deviceId, phone.deviceId);

    const refreshed = await api('/api/auth/refresh', {
      method: 'POST',
      body: { deviceId: phone.deviceId, refreshToken: phone.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.body.refreshToken, phone.refreshToken);

    // The consumed token must not work a second time.
    const replay = await api('/api/auth/refresh', {
      method: 'POST',
      body: { deviceId: phone.deviceId, refreshToken: phone.refreshToken },
    });
    assert.equal(replay.status, 401);

    const me = await api('/api/auth/me', { token: phone.accessToken });
    assert.equal(me.body.devices.length, 2);
  });
});

describe('entries and the gains engine', () => {
  it('nets savings against not-worth-it spends', async () => {
    const user = await register('gains@example.com');
    const token = user.accessToken;

    // Walked instead of the bus: ₹30 saved, twice.
    await api('/api/savings', {
      method: 'POST',
      token,
      body: { title: 'Walked to office', amount: rupeesToPaise(30), baseline: 'Bus fare', occurredOn: '2026-09-02' },
    });
    await api('/api/savings', {
      method: 'POST',
      token,
      body: { title: 'Cooked at home', amount: rupeesToPaise(220), baseline: 'Would have ordered in', occurredOn: '2026-09-03' },
    });

    // A snack that was not worth it: ₹100 lost.
    await api('/api/transactions', {
      method: 'POST',
      token,
      body: { type: 'expense', amount: rupeesToPaise(100), note: 'Impulse snack', worth: 'not_worth', occurredOn: '2026-09-04' },
    });
    // An expense that was worth it does not count as a leak.
    await api('/api/transactions', {
      method: 'POST',
      token,
      body: { type: 'expense', amount: rupeesToPaise(5000), note: 'Rent', worth: 'worth', occurredOn: '2026-09-01' },
    });
    await api('/api/transactions', {
      method: 'POST',
      token,
      body: { type: 'income', amount: rupeesToPaise(40000), note: 'Salary', occurredOn: '2026-09-01' },
    });

    const { body: report } = await api('/api/reports/monthly?month=2026-09', { token });
    assert.equal(report.saved, rupeesToPaise(250));
    assert.equal(report.leaked, rupeesToPaise(100));
    assert.equal(report.netGain, rupeesToPaise(150));
    assert.equal(report.status, 'green');
    assert.equal(report.investSuggestion, rupeesToPaise(150));
    assert.equal(report.income, rupeesToPaise(40000));
    assert.equal(report.expense, rupeesToPaise(5100));
    assert.equal(report.netCash, rupeesToPaise(34900));
  });

  it('goes red when leaks outweigh savings and stops suggesting an investment', async () => {
    const user = await register('red@example.com');
    const token = user.accessToken;
    await api('/api/savings', {
      method: 'POST',
      token,
      body: { title: 'Skipped cab', amount: rupeesToPaise(50), occurredOn: '2026-09-05' },
    });
    await api('/api/transactions', {
      method: 'POST',
      token,
      body: { type: 'expense', amount: rupeesToPaise(400), note: 'Late night delivery', worth: 'not_worth', occurredOn: '2026-09-06' },
    });

    const { body: report } = await api('/api/reports/monthly?month=2026-09', { token });
    assert.equal(report.netGain, rupeesToPaise(-350));
    assert.equal(report.status, 'red');
    assert.equal(report.investSuggestion, 0);
    assert.equal(report.topLeaks[0].note, 'Late night delivery');
  });

  it('subtracts money already invested from the suggestion', async () => {
    const user = await register('invested@example.com');
    const token = user.accessToken;
    await api('/api/savings', {
      method: 'POST',
      token,
      body: { title: 'Cycled all month', amount: rupeesToPaise(1000), occurredOn: '2026-09-10' },
    });
    await api('/api/investments', {
      method: 'POST',
      token,
      body: { amount: rupeesToPaise(600), instrument: 'Index fund SIP', forMonth: '2026-09', occurredOn: '2026-09-30' },
    });

    const { body: report } = await api('/api/reports/monthly?month=2026-09', { token });
    assert.equal(report.invested, rupeesToPaise(600));
    assert.equal(report.investSuggestion, rupeesToPaise(400));
  });

  it('tracks budget progress against real spending', async () => {
    const user = await register('budget@example.com');
    const token = user.accessToken;
    const { body: categories } = await api('/api/categories', { token });
    const food = categories.items.find((c: any) => c.name === 'Food');

    await api('/api/budgets', {
      method: 'POST',
      token,
      body: { categoryId: food.id, month: '2026-09', limitAmount: rupeesToPaise(4000) },
    });
    await api('/api/transactions', {
      method: 'POST',
      token,
      body: { type: 'expense', amount: rupeesToPaise(1000), categoryId: food.id, occurredOn: '2026-09-08' },
    });

    const { body: report } = await api('/api/reports/monthly?month=2026-09', { token });
    const progress = report.budgets[0];
    assert.equal(progress.limit, rupeesToPaise(4000));
    assert.equal(progress.spent, rupeesToPaise(1000));
    assert.equal(progress.remaining, rupeesToPaise(3000));
    assert.equal(progress.usedPercent, 25);
  });

  it('keeps one user out of another user data', async () => {
    const owner = await register('owner@example.com');
    const stranger = await register('stranger@example.com');
    const { body: created } = await api('/api/savings', {
      method: 'POST',
      token: owner.accessToken,
      body: { title: 'Private', amount: rupeesToPaise(10), occurredOn: '2026-09-09' },
    });

    const { body: theirList } = await api('/api/savings', { token: stranger.accessToken });
    assert.equal(theirList.items.length, 0);

    const patched = await api(`/api/savings/${created.id}`, {
      method: 'PATCH',
      token: stranger.accessToken,
      body: { amount: rupeesToPaise(999) },
    });
    assert.equal(patched.status, 404);
  });

  it('counts a saving streak across consecutive days', async () => {
    const user = await register('streak@example.com');
    const today = new Date('2026-09-16T10:00:00Z');
    const day = (offset: number): string =>
      new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);

    for (const offset of [0, 1, 2, 4]) {
      await api('/api/savings', {
        method: 'POST',
        token: user.accessToken,
        body: { title: `Day ${offset}`, amount: rupeesToPaise(20), occurredOn: day(offset) },
      });
    }
    assert.equal(await savingStreak(db, user.user.id, today), 3);
  });

  it('hides soft-deleted rows from listings', async () => {
    const user = await register('delete@example.com');
    const token = user.accessToken;
    const { body: created } = await api('/api/savings', {
      method: 'POST',
      token,
      body: { title: 'Mistake', amount: rupeesToPaise(10), occurredOn: '2026-09-11' },
    });
    const removed = await api(`/api/savings/${created.id}`, { method: 'DELETE', token });
    assert.equal(removed.status, 204);

    const { body: list } = await api('/api/savings', { token });
    assert.equal(list.items.length, 0);
  });

  it('rejects a negative amount', async () => {
    const user = await register('validate@example.com');
    const { status } = await api('/api/savings', {
      method: 'POST',
      token: user.accessToken,
      body: { title: 'Bad', amount: -500, occurredOn: '2026-09-12' },
    });
    assert.equal(status, 400);
  });
});

describe('multi-device sync', () => {
  it('carries changes from one device to another', async () => {
    const phone = await register('sync@example.com', 'Phone');
    const tablet = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'sync@example.com', password: 'supersecret123', deviceName: 'Tablet' },
    });

    const localId = crypto.randomUUID();
    const pushed = await api('/api/sync', {
      method: 'POST',
      token: phone.accessToken,
      body: {
        since: 0,
        changes: {
          savings: [
            { id: localId, title: 'Offline entry', amount: rupeesToPaise(75), baseline: '', occurredOn: '2026-09-13', updatedAt: Date.now() },
          ],
        },
      },
    });
    assert.deepEqual(pushed.body.rejected, []);

    const { body: pulled } = await api('/api/sync?since=0', { token: tablet.body.accessToken });
    const entry = pulled.changes.savings.find((s: any) => s.id === localId);
    assert.equal(entry.title, 'Offline entry');
    assert.equal(entry.amount, rupeesToPaise(75));
  });

  it('keeps the newer edit when two devices race', async () => {
    const user = await register('conflict@example.com');
    const token = user.accessToken;
    const id = crypto.randomUUID();
    const base = Date.now();

    const push = (title: string, updatedAt: number) =>
      api('/api/sync', {
        method: 'POST',
        token,
        body: {
          since: 0,
          changes: { savings: [{ id, title, amount: rupeesToPaise(10), baseline: '', occurredOn: '2026-09-14', updatedAt }] },
        },
      });

    await push('Newer wins', base + 1000);
    await push('Stale loses', base);

    const { body: list } = await api('/api/savings', { token });
    assert.equal(list.items[0].title, 'Newer wins');
  });

  it('applies a tombstone without wiping the row columns', async () => {
    const user = await register('tombstone@example.com');
    const token = user.accessToken;
    const { body: created } = await api('/api/transactions', {
      method: 'POST',
      token,
      body: { type: 'expense', amount: rupeesToPaise(60), note: 'Sync me', occurredOn: '2026-09-15' },
    });

    const pushed = await api('/api/sync', {
      method: 'POST',
      token,
      body: { since: 0, changes: { transactions: [{ id: created.id, deleted: true, updatedAt: Date.now() }] } },
    });
    assert.deepEqual(pushed.body.rejected, []);

    const { body: pulled } = await api('/api/sync?since=0', { token });
    const row = pulled.changes.transactions.find((t: any) => t.id === created.id);
    assert.equal(row.deleted, true);
    assert.equal(row.type, 'expense');
    assert.equal(row.amount, rupeesToPaise(60));
  });

  it('reports invalid rows instead of failing the whole batch', async () => {
    const user = await register('partial@example.com');
    const { body } = await api('/api/sync', {
      method: 'POST',
      token: user.accessToken,
      body: {
        since: 0,
        changes: {
          savings: [
            { id: crypto.randomUUID(), title: 'Good', amount: 500, baseline: '', occurredOn: '2026-09-15', updatedAt: Date.now() },
            { id: crypto.randomUUID(), title: '', amount: -1, occurredOn: 'nope', updatedAt: Date.now() },
          ],
        },
      },
    });
    assert.equal(body.rejected.length, 1);
    assert.equal(body.changes.savings.length, 1);
  });
});

describe('monthly email', () => {
  it('renders a green month with an invest nudge', async () => {
    const user = await register('email@example.com');
    await api('/api/savings', {
      method: 'POST',
      token: user.accessToken,
      body: { title: 'Walked everywhere', amount: rupeesToPaise(1200), occurredOn: '2026-09-03' },
    });
    const report = await buildMonthlyReport(db, user.user.id, '2026-09');
    const mail = renderMonthlyEmail('Harish', report);

    assert.match(mail.subject, /up ₹1,200\.00/);
    assert.match(mail.html, /free to invest/i);
    assert.match(mail.html, /₹1,200\.00/);
    assert.match(mail.text, /Net gain: ₹1,200\.00/);
  });

  it('escapes user text so a note cannot inject markup', async () => {
    const user = await register('escape@example.com');
    await api('/api/savings', {
      method: 'POST',
      token: user.accessToken,
      body: { title: '<script>alert(1)</script>', amount: rupeesToPaise(5), occurredOn: '2026-09-03' },
    });
    const report = await buildMonthlyReport(db, user.user.id, '2026-09');
    const mail = renderMonthlyEmail('Harish', report);
    assert.ok(!mail.html.includes('<script>'));
    assert.match(mail.html, /&lt;script&gt;/);
  });

  it('sends each user at most one report per month', async () => {
    const fresh = await openDb(':memory:');
    const freshServer = createApp(fresh).listen(0);
    await new Promise((resolve) => freshServer.once('listening', resolve));
    const address = freshServer.address();
    const freshBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    await fetch(`${freshBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'once@example.com', password: 'supersecret123', name: 'Harish' }),
    });

    const now = new Date('2026-10-01T02:00:00Z');
    assert.equal(await sendDueMonthlyReports(fresh, now), 1);
    assert.equal(await sendDueMonthlyReports(fresh, now), 0);
    freshServer.close();
  });

  it('skips users who turned monthly email off', async () => {
    const fresh = await openDb(':memory:');
    const freshServer = createApp(fresh).listen(0);
    await new Promise((resolve) => freshServer.once('listening', resolve));
    const address = freshServer.address();
    const freshBase = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    const created = await fetch(`${freshBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'optout@example.com', password: 'supersecret123', name: 'Harish' }),
    }).then((r) => r.json() as Promise<{ accessToken: string }>);

    await fetch(`${freshBase}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${created.accessToken}` },
      body: JSON.stringify({ monthlyEmail: false }),
    });

    assert.equal(await sendDueMonthlyReports(fresh, new Date('2026-10-01T02:00:00Z')), 0);
    freshServer.close();
  });
});
