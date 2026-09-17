# Running FinLedger for real

Everything here uses free tiers and open-source tools. Nothing needs a card.

---

## The one thing that will bite you

**Render's free tier gives your service a disk that is wiped on every deploy and
every restart.** If FinLedger stored its SQLite file on that disk, you would lose
every entry each time the service restarted. Since you need real storage and
multi-device sync, the database has to live somewhere outside the web service.

That is why the server talks to **libSQL** instead of a local SQLite file. It is
the same SQLite SQL either way:

| Where | `DATABASE_URL` | Persistent? |
|---|---|---|
| Your laptop | `file:finledger.db` | Yes, it is a file you own |
| Production | `libsql://finledger-you.turso.io` | Yes, hosted, survives deploys |

Switching between them is one environment variable. No code changes.

---

## Step 1 — the database (Turso, free)

1. Sign up at <https://turso.tech> (GitHub login, no card).
2. Install the CLI and create a database:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   turso db create finledger
   turso db show finledger --url        # -> libsql://finledger-you.turso.io
   turso db tokens create finledger     # -> a long token
   ```
3. Keep both values. They become `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.

The server creates its own tables on first boot, so there is no migration step.

> Alternative if you would rather not add an account: Render's free **Postgres**
> also persists, but it expires after 30 days and would need a different driver.
> Turso stays on SQLite, which is why it is the default here.

---

## Step 2 — the API (Render, free)

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, point it at the repo.
3. Settings:
   - **Root directory:** `server`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Add these environment variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your `libsql://…` URL |
   | `DATABASE_AUTH_TOKEN` | the Turso token |
   | `JWT_SECRET` | a long random string (see below) |
   | `CRON_SECRET` | another long random string |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASS` | a Gmail **App Password**, not your real password |
   | `MAIL_FROM` | `FinLedger <your@gmail.com>` |

   Generate the secrets with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Deploy, then check `https://your-app.onrender.com/health` returns `{"ok":true}`.

### What the free tier costs you

A free Render service **sleeps after about 15 minutes of inactivity**, and the
next request takes roughly 30–60 seconds to wake it. The app is built
offline-first, so entries you log still save instantly on the phone and sync when
the server wakes up — but the first sign-in of the day will feel slow. That is
the trade for not paying.

---

## Step 3 — email (Gmail App Password, free)

Gmail will not accept your normal password from an app. You need an App Password:

1. Turn on 2-Step Verification on your Google account.
2. Go to <https://myaccount.google.com/apppasswords>.
3. Create one named "FinLedger" and copy the 16-character value.
4. Put it in `SMTP_PASS`.

Gmail allows around 500 messages a day, which is far more than one monthly
statement needs.

**If you set no SMTP values at all, nothing breaks** — the server falls back to
a transport that logs the message instead of sending it, which is what local
development uses.

Test it from the app: **Report → Send … statement now**.

---

## Step 4 — the month-end email actually firing

The server has an hourly timer, but a sleeping free service cannot run timers.
So there is also an endpoint an outside scheduler can call:

```
POST /api/cron/monthly-reports
x-cron-secret: <your CRON_SECRET>
```

It is safe to call every day: a `sent_reports` table records who has already been
emailed for a given month, so nobody gets two copies.

A GitHub Actions workflow is already included at
`.github/workflows/monthly-reports.yml`. To switch it on, add two repository
secrets (**Settings → Secrets and variables → Actions**):

- `FINLEDGER_API_URL` — `https://your-app.onrender.com`
- `FINLEDGER_CRON_SECRET` — the same value as `CRON_SECRET`

It runs daily and doubles as a keep-alive ping. GitHub Actions is free for public
repos and has a free monthly allowance for private ones.

---

## Step 5 — the phone app

The app already points at the deployed API, so this is all it takes:

```bash
cd mobile
npx expo start
```

Scan the QR code with **Expo Go** (free, on the App Store and Play Store). That is
enough to use FinLedger on your own phone every day.

If you deploy your own API somewhere else, override the address:

```bash
EXPO_PUBLIC_API_URL=https://your-app.onrender.com npx expo start
```

To get an installable Android APK you can share, use EAS Build's free tier:

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Set `EXPO_PUBLIC_API_URL` in `eas.json` so the built app talks to your server
rather than `localhost`.

---

## What I need from you

Nothing is hardcoded, so to go live you only have to supply these six values:

1. `DATABASE_URL` and `DATABASE_AUTH_TOKEN` — from Turso (Step 1)
2. `JWT_SECRET` — any long random string you generate
3. `CRON_SECRET` — another one
4. `SMTP_USER` and `SMTP_PASS` — your Gmail address and App Password

Tell me the Render URL once it is deployed and I can point the app at it and
verify the whole round trip.

**Never commit these.** `.env` is gitignored; `server/.env.example` shows the
shape without the values.

---

## Checking it works

```bash
# API is awake
curl https://your-app.onrender.com/health

# The scheduled send is wired up correctly
curl -X POST https://your-app.onrender.com/api/cron/monthly-reports \
  -H "x-cron-secret: <your CRON_SECRET>"
# -> {"sent": 0}   (0 simply means nobody is due yet)
```
