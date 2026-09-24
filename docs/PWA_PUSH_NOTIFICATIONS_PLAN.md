# PWA Push Notifications Plan

## Goal

Send optional push notifications to every opted-in device when saving a daily close deducts inventory and causes a material to newly enter the **To Order** status. While it remains in that status, send a reminder every day at 7:00 AM WIB.

Example notification:

> Order 5 kg of Chicken.

The quantity in the notification must come from the material's configured reorder quantity.

## Platform feasibility

Web Push is supported by Home Screen web apps on iOS and iPadOS 16.4 and later. The user must add the app to the Home Screen, open it there, and explicitly opt in through an in-app action. A regular bookmark that opens in the browser does not provide the same installed web app experience. Push requires a service worker and a server-side sender. See [WebKit's iOS and iPadOS Web Push guide](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) and [web.dev's Push notifications overview](https://web.dev/articles/push-notifications-overview).

## Existing project context

- `public/manifest.json` already sets `display` to `standalone`.
- Firebase/Firestore and Firebase Admin are already used by the app.
- Inventory materials have `reorderThreshold`, `reorderQuantity`, and `lowStockAlertEnabled` fields.
- The existing reorder status logic uses the threshold, alert setting, stock initialization, and whether an open supplier order exists.
- The daily-close flow saves a daily item log and then calculates and persists inventory usage.
- `public/sw.js` is already registered by `SwRegister`; extend the existing worker with push handlers and avoid caching API responses.

Recheck these findings against the current code before implementation.

## Implementation plan

### 1. Inspect the current architecture

Before changing code:

- Read `AGENTS.md` and follow its Git workflow.
- Read the relevant Next.js 16 guides in `node_modules/next/dist/docs/` before changing Next.js code.
- Trace the daily-close save, inventory usage calculation, stock ledger, and reorder status logic.
- Inspect the PWA manifest and service-worker setup, Firebase configuration, Firestore rules, server routes, and authentication model.
- Reuse existing data, UI, and security conventions where possible.

### 2. Add device opt-in

- Add a clear, optional **Enable push notifications** control in an appropriate existing settings or inventory screen.
- Explain what alerts will be sent and let the user enable or disable notifications for the current device.
- Treat each opted-in PWA installation as a recipient. Fan out alerts to all active subscriptions for this POS/store, including the device that did not enter the daily close. If the existing account model supports store membership, use it to scope recipients; otherwise document the device-level subscription scope.
- Ask for notification permission only after the user taps the control. Never show the browser permission prompt automatically.
- Use feature detection and show a useful fallback when the browser or device cannot subscribe.
- On iPhone and iPad, explain that the app must be added to the Home Screen and opened from its icon.
- Add or update the service worker without conflicting with the existing Next.js setup.

### 3. Trigger the initial alert and recurring reminders

After a daily close has saved successfully and its inventory usage has been persisted:

- Recheck each affected material using the same business rules as the existing **To Order** UI.
- Send an immediate alert to all active subscribed devices only when the material newly enters **To Order** because of that daily-close deduction.
- Do not send an alert when alerts are disabled, stock is not initialized, or an open supplier order means the material is already **Ordered / On the Way**.
- Use the material's configured `reorderQuantity` and `baseUnit` in the message, for example: `Order 5 kg of Chicken.`
- Do not calculate or guess a replacement quantity. If the configured quantity is missing or invalid, skip the push and make the missing setup clear in the app.
- If the material remains **To Order**, send a reminder to all active subscribed devices at 7:00 AM `Asia/Jakarta` (WIB) on each following calendar day. The first scheduled reminder is the next 7:00 AM after the immediate alert.
- Recheck the material's current status immediately before every reminder. Stop reminders as soon as it changes to any other status, including **Ordered / On the Way**. If it later newly enters **To Order** again, send a new immediate alert and begin a new reminder cycle.
- Send no more than one reminder per material per WIB calendar day, even if the scheduler retries or runs more than once.

### 4. Send reliably, securely, and on schedule

- Send pushes from a server-side flow using a method compatible with the app's supported browsers and installed iOS Home Screen app. Evaluate standards-based Web Push and Firebase Cloud Messaging for this project.
- Store subscriptions safely and associate them with the intended account or POS installation according to the existing authentication and Firestore security model. Do not assume a signed-in user exists; document any device-level subscription limitation. Each recipient must opt in on their own device.
- Keep private push credentials on the server. Do not send from the browser or trust client-supplied notification text or stock quantities.
- Persist enough reminder state to track each active **To Order** episode and the last successful reminder date. Make the initial alert and scheduled reminders idempotent so repeated daily-close saves, retries, or scheduler runs cannot duplicate them.
- Configure a protected hosted scheduler to run the reminder check at 7:00 AM `Asia/Jakarta`, with correct timezone handling and a durable server-side source of truth. Do not depend on any recipient opening the PWA for reminders to run.
- A push delivery failure must not undo or block the daily-close save. Handle expired or invalid subscriptions.
- When tapped, open the relevant inventory **To Order** view or material detail.

### 5. Verify the behavior

Add focused coverage for the transition rule and duplicate prevention. Check:

- Stock crossing to or below the threshold.
- Alerts disabled.
- An open supplier order.
- Missing or invalid reorder quantity.
- Repeated daily-close saves and retries.
- Reminder delivery to multiple opted-in devices, including when the device that saved daily close is different from the receiving device.
- The 7:00 AM WIB reminder cadence, duplicate scheduler runs, and stopping reminders after the status changes.
- Unsupported browsers and denied notification permission.
- Subscription removal or expiration.
- Push delivery failure while the daily close still saves.

Document required server environment variables and deployment setup without including secret values.

## Completion notes

After implementation, summarize the behavior, platform requirements, configuration steps, and verification performed. Create a focused commit and push it to the configured remote as required by `AGENTS.md`.
