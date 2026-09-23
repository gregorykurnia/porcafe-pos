# Supplier delivery scheduler deployment

The supplier delivery runner is available at `GET /api/cron/inventory-supplier-deliveries`. It accepts only a bearer token matching `CRON_SECRET`, uses the Firebase Admin SDK, and evaluates schedule dates and times in `Asia/Jakarta`.

Configure these server-only environment variables in the production deployment:

- `CRON_SECRET`: a random value with at least 16 characters.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the service account JSON encoded as one environment variable. Grant it only the Firestore access required by this app. Google Application Default Credentials can be used instead on supported hosts.
- `FIREBASE_PROJECT_ID`: optional when it is already supplied by the app's Firebase public configuration.

For Vercel, register the path in the project's `vercel.json` and redeploy:

```json
{
  "crons": [
    {
      "path": "/api/cron/inventory-supplier-deliveries",
      "schedule": "* * * * *"
    }
  ]
}
```

Vercel Hobby allows one cron invocation per day, while per-minute execution requires Pro or Enterprise. Use a host that supports the configured frequency if the project is on Hobby; a once-daily job cannot honor each schedule's delivery time. The runner is idempotent by schedule and occurrence date, so retries do not add stock twice.

This secures the scheduled endpoint only. It does not change the app's existing Firestore rules or add user sign-in and role checks to browser-originated inventory writes.
