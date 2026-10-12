# Porcafe POS

Daily close, sales reports, stock, and supplier ordering for the Porcafe team. It runs as a Next.js app (App Router, React 19) on Firebase Firestore, and staff use it on phones as an installable web app. For how the team uses it day to day, see [docs/STAFF_GUIDE.md](docs/STAFF_GUIDE.md).

## Setup

You need Node.js 20.9 or later (the minimum for Next.js 16).

1. Install dependencies: `npm install`
2. Create `.env.local` with the values below. Ask the project owner for them, and never commit this file.

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase web config (browser) |
| `NEXT_PUBLIC_INVENTORY_USAGE_GO_LIVE_DATE` | Optional. The first day that counts toward usage |
| `ANTHROPIC_API_KEY` | Reading the daily ticket sheet photo (`/api/scan-ticket`) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Server-side Firestore access for push and cron jobs |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push keys |
| `CRON_SECRET`, `APP_ORIGIN` | Protects the cron routes and builds links in push messages |

If you use the Vercel CLI, `vercel env pull` writes these, along with `VERCEL_OIDC_TOKEN`.

3. Start the dev server: `npm run dev`, then open http://localhost:3000.

## Scripts

- `npm run dev`: development server
- `npm run build`: production build (also type-checks)
- `npm start`: serve the production build
- `npm test`: unit tests for the pure logic in `src/**/*.test.ts` (Node's test runner through `tsx`). These need no browser and no database.
- `npm run lint`: ESLint

## Layout

- `src/app`: routes. `/` Home, `/items` Daily close and History, `/reports`, `/inventory` Stock, `/setup`. `next.config.ts` holds the redirects for moved pages.
- `src/lib`: the pure logic (reporting, dates, usage, supplier ordering) and `data.ts`, the Firestore layer. Every write in `data.ts` calls `assertOnline()`, so writes are refused while the device is offline and nothing is queued.
- `src/components`: UI. `setup/` holds the Setup sections. `inventory/` holds the Stock components.
- `docs/`: the UX audit and plan, plus deployment notes for push alerts and supplier ordering.

## Deploy

- **App:** Vercel. `vercel.json` schedules `/api/cron/reorder-push-reminders` daily at 00:00 UTC (07:00 WIB) and `/api/cron/inventory-supplier-deliveries` daily at 01:00 UTC (08:00 WIB). Both need `CRON_SECRET` set in Vercel.
- **Firestore:** `firebase deploy --only firestore` publishes `firestore.rules` and `firestore.indexes.json`.
- **Push alerts and supplier ordering:** see [docs/PWA_PUSH_NOTIFICATIONS_DEPLOYMENT.md](docs/PWA_PUSH_NOTIFICATIONS_DEPLOYMENT.md) and [docs/SUPPLIERS_ORDERING_DEPLOYMENT.md](docs/SUPPLIERS_ORDERING_DEPLOYMENT.md).

## Known limits

- **No sign-in.** The Firestore rules allow reads and writes on every collection except the push collections, so anyone with the Firebase web config can change data. Setup is not PIN-protected. Real access control is a separate project.
- **Usage recalculation** works one day at a time, from Stock → Usage recap. There is no range recalculation yet.
- **Recurring supplier deliveries** are created by `/api/cron/inventory-supplier-deliveries` at 08:00 WIB daily, and also when a device opens Stock. The cron only creates deliveries whose time has passed, so a delivery time later than 08:00 is created only if someone opens Stock after that time. Keep delivery times at 08:00 or earlier.
