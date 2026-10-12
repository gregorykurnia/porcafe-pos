# Access plan: sign-in and Firestore rules

Status: planned, not started. Target: within the next few weeks, as a separate piece of work from the UX backlog.

## Where we are

- There is no sign-in. Anyone with the app's Firebase web config can read and write the app's data.
- `firestore.rules` allows reads and writes on every collection except `pushSubscriptions` and `pushNotificationEpisodes`. Those two are server-only; the Admin SDK bypasses the rules for them.
- Setup is not PIN-protected. This was a deliberate choice, because the team shares phones and a PIN is not real security.

## Goal

- Staff sign in with their own accounts (Firebase Auth).
- Rules allow access only to signed-in staff, and only the operations each role needs.
- Setup changes (Menu, Materials, Recipes, Suppliers, Import, Data maintenance) are limited to managers.
- The offline behaviour stays the same: a device that signed in before can still read from its cache, and writes stay refused while offline.

## Steps

1. **Choose the sign-in method.** Email and password is the simplest for a small team, and Google sign-in is the alternative. Decide before building.
2. **Create the accounts.** One per person, with a role: staff or manager.
3. **Add a sign-in gate to the app.** Redirect signed-out users to a sign-in page. Test that a device signed in yesterday still opens the app offline.
4. **Write the rules in stages.** Start with "signed in" for every collection. Then restrict the Setup collections to managers, using a custom claim or a `roles` document. Keep the push collections server-only.
5. **Check the server paths.** The cron routes and the push routes use the Admin SDK and do not depend on the rules, so confirm that after each rules deploy.
6. **Roll out.** Deploy the rules with `firebase deploy --only firestore`, then have each person sign in once on each phone.

## Risks

- A phone that is offline and not signed in cannot read data. Staff should sign in before a shift.
- Rules that are too tight will fail silently in the browser. Test each collection after each stage.
- Custom claims need a token refresh, so a role change takes effect at the next sign-in.

## Decisions needed

- The sign-in method (step 1).
- Who the managers are.
- The date for the first staff sign-in.
