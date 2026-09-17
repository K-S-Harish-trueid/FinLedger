# FinLedger

Most money apps only count what you spend. FinLedger also counts what you *didn't*.

Walk instead of taking the bus and you keep the fare — that is a real gain, and it
gets logged. Buy something that turns out not to have been worth it and that is a
real loss, even though a normal expense tracker would file it next to your rent.
The difference between the two is your **net gain** for the month, and when the
month closes green, that number is what you can invest without touching your
budget.

```
  saved by choosing cheaper  −  spent on things not worth it  =  net gain
```

## The app

Five tabs, built for logging things in seconds while you are standing at a bus stop.

| Tab | What it is for |
|---|---|
| **Today** | Net gain, saved vs leaked, your streak, and what needs attention |
| **Saved** | Log an avoided cost. One tap for common swaps, or type your own |
| **Leaks** | Log a regret, and triage expenses you have not judged yet |
| **Money** | Ordinary income and expenses, plus monthly budgets per category |
| **Report** | The month's full breakdown, record what you invested, email the statement |

At month end everyone gets an emailed statement: what you saved, where it leaked,
and how much is free to invest.

## How it is put together

```
server/   Node + Express + libSQL (SQLite), JWT auth, delta sync, nodemailer
mobile/   Expo (React Native) + TypeScript, file-based routing, offline-first
```

Three decisions worth knowing about:

- **Money is integer paise, everywhere.** Rupees only exist at render time, so no
  float drift.
- **The app works offline.** Entries save locally and queue for the next sync.
  Two devices reconcile by last-write-wins with tombstones for deletes, so you can
  log on a train and it lands when you surface.
- **The database is libSQL, not a plain file.** Free hosts wipe their disks on
  restart. Same SQLite SQL, but it can point at a hosted database in production —
  see [DEPLOY.md](DEPLOY.md).

## Running it locally

Two terminals. No accounts, no services, nothing to sign up for.

```bash
# 1. API on :4000, storing to a local SQLite file
cd server
npm install
npm start

# 2. The app
cd mobile
npm install
npx expo start
```

Press `w` for the browser, or scan the QR code with **Expo Go** on your phone.
The app defaults to `http://localhost:4000`; override with `EXPO_PUBLIC_API_URL`.

Without SMTP configured the server logs emails instead of sending them, so the
whole thing runs with zero configuration while you are developing.

### Tests

```bash
cd server && npm test        # 22 tests: auth, gains maths, sync, email
cd server && npm run typecheck
cd mobile && npx tsc --noEmit
```

## Deploying

See **[DEPLOY.md](DEPLOY.md)** — free tiers throughout (Turso, Render, Gmail SMTP,
GitHub Actions), including the gotchas about ephemeral disks and sleeping services,
and the exact list of values you need to supply.

## API

All endpoints except register/login need `Authorization: Bearer <accessToken>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` · `/login` · `/refresh` · `/logout` | Accounts and per-device sessions |
| `GET` `PATCH` | `/api/auth/me` | Profile, signed-in devices, email preference |
| `GET` `POST` `PATCH` `DELETE` | `/api/{transactions,savings,budgets,investments,categories}` | CRUD |
| `GET` `POST` | `/api/sync` | Pull and push changes since a cursor |
| `GET` | `/api/reports/monthly` · `/summary` | The month's numbers |
| `POST` | `/api/reports/email` | Send this month's statement now |
| `POST` | `/api/cron/monthly-reports` | Trigger due statements (needs `x-cron-secret`) |
