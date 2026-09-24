# PWA Push Notifications Plan

## Goal

Send an optional push notification to subscribed devices when saving a daily close deducts inventory and causes a material to newly enter the **To Order** status.

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
- No existing service worker was found during planning.

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
- Ask for notification permission only after the user taps the control. Never show the browser permission prompt automatically.
- Use feature detection and show a useful fallback when the browser or device cannot subscribe.
- On iPhone and iPad, explain that the app must be added to the Home Screen and opened from its icon.
- Add or update the service worker without conflicting with the existing Next.js setup.

### 3. Trigger alerts on a new reorder transition

After a daily close has saved successfully and its inventory usage has been persisted:

- Recheck each affected material using the same business rules as the existing **To Order** UI.
- Notify only when the material newly enters **To Order** because of that daily-close deduction.
- Do not send an alert when alerts are disabled, stock is not initialized, or an open supplier order means the material is already **Ordered / On the Way**.
- Use the material's configured `reorderQuantity` and `baseUnit` in the message, for example: `Order 5 kg of Chicken.`
- Do not calculate or guess a replacement quantity. If the configured quantity is missing or invalid, skip the push and make the missing setup clear in the app.

### 4. Send reliably and securely

- Send pushes from a server-side flow using a method compatible with the app's supported browsers and installed iOS Home Screen app. Evaluate standards-based Web Push and Firebase Cloud Messaging for this project.
- Store subscriptions safely and associate them with the intended account or POS installation according to the existing authentication and Firestore security model. Do not assume a signed-in user exists; document any device-level subscription limitation.
- Keep private push credentials on the server. Do not send from the browser or trust client-supplied notification text or stock quantities.
- Make delivery idempotent so a repeated save or retry for the same daily close cannot send duplicate alerts. A genuine later transition back into **To Order** after stock recovers may send a new alert.
- A push delivery failure must not undo or block the daily-close save. Handle expired or invalid subscriptions.
- When tapped, open the relevant inventory **To Order** view or material detail.

### 5. Verify the behavior

Add focused coverage for the transition rule and duplicate prevention. Check:

- Stock crossing to or below the threshold.
- Alerts disabled.
- An open supplier order.
- Missing or invalid reorder quantity.
- Repeated daily-close saves and retries.
- Unsupported browsers and denied notification permission.
- Subscription removal or expiration.
- Push delivery failure while the daily close still saves.

Document required server environment variables and deployment setup without including secret values.

## Completion notes

After implementation, summarize the behavior, platform requirements, configuration steps, and verification performed. Create a focused commit and push it to the configured remote as required by `AGENTS.md`.
