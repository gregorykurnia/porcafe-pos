# PWA push notifications deployment

Porcafe POS sends standards-based Web Push notifications from the server. A daily-close inventory deduction can send an immediate **To Order** alert, and the protected reminder runner sends at most one reminder per material per WIB calendar day while the material remains in that status.

## Browser and device requirements

- Serve the app over HTTPS.
- The user must enable notifications on each device that should receive alerts.
- On iPhone and iPad, the user must add Porcafe POS to the Home Screen and open it from that icon before opting in. A Safari bookmark does not provide the installed web app push experience.
- Notification permission is requested only after the user taps **Enable push notifications** in Inventory.

## Server environment

Set these server-only environment variables in the production deployment:

- `VAPID_SUBJECT`: a contact URI such as `mailto:ops@example.com` or an HTTPS URL.
- `VAPID_PUBLIC_KEY`: the URL-safe base64 VAPID public key.
- `VAPID_PRIVATE_KEY`: the matching URL-safe base64 VAPID private key. Keep this secret on the server.
- `CRON_SECRET`: a random bearer secret with at least 16 characters. It protects the scheduled reminder endpoint.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: service account JSON encoded as one environment variable, or use Google Application Default Credentials on a supported host.
- `FIREBASE_PROJECT_ID`: optional when already supplied by `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- `APP_ORIGIN`: optional exact origin such as `https://pos.example.com`. Set this when the app is served behind a proxy or custom domain so browser-origin checks use the public origin.

Generate a VAPID key pair once with `npx web-push generate-vapid-keys --json`, then put the matching public and private values into the server environment. Keep the same key pair after deployment; changing it requires existing devices to subscribe again. Never put the private key or service account credentials in a `NEXT_PUBLIC_` variable or commit them to the repository.

The Firebase Admin service account needs Firestore read/write access for inventory data, `pushSubscriptions`, and `pushNotificationEpisodes`. The two push collections are excluded from browser access in `firestore.rules`; Admin SDK access bypasses those rules.

Deploy the updated Firestore rules with `firebase deploy --only firestore:rules` before enabling subscriptions in production. The rules change is not active in Firebase until it is deployed.

## Scheduler

`vercel.json` registers `GET /api/cron/reorder-push-reminders` at `0 0 * * *` UTC, which targets 7:00 AM in `Asia/Jakarta` (WIB). Vercel cron requests use the configured `CRON_SECRET` bearer value. Vercel Hobby timing can be up to 59 minutes late; use a plan or scheduler with per-minute precision when reminders must arrive close to exactly 7:00 AM. On another host, schedule the same route daily at 00:00 UTC and send `Authorization: Bearer <CRON_SECRET>`.

The route also checks the current WIB time and durable Firestore episode state. Duplicate scheduler invocations cannot claim a second reminder for the same material and calendar date. Each reminder re-reads the material, stock ledger, initialization state, and open supplier orders before sending. Expired push endpoints are removed.

## Recipient scope and data model

This app currently has no sign-in or store-membership model. Subscriptions are therefore device-level recipients scoped to this single Porcafe POS Firebase project. Each installation opts in independently; all active subscriptions in this project receive an eligible alert, including devices that did not save the daily close. This is not per-user access control. Existing Firestore data outside the two protected push collections still follows the project's existing security rules.

Subscriptions and reminder episodes are written through Firebase Admin. The browser sends only its Web Push subscription and the saved daily-close date; stock quantities and notification copy are rebuilt from Firestore on the server. A push failure is logged and does not undo a saved daily close. Tapping an alert opens Inventory at the reorder overview.
