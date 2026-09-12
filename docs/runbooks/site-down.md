# Runbook: Site down

## Triage

1. Check `GET /api/healthz` first. It is the fastest signal for whether the
   web app is up and can reach Convex.
2. Confirm symptoms. Are all pages returning 5xx, is only search failing, or
   is the data merely stale?
3. Check Vercel deploy status and the latest `Deploy` workflow run.
4. Check the Convex dashboard for deployment health and function error logs.
5. Missing env vars are a common cause after infra changes. The web app on
   Vercel needs `NEXT_PUBLIC_CONVEX_URL`, `SYNAC_CONVEX_SERVICE_KEY`,
   `NEXT_PUBLIC_SITE_URL`, `SYNAC_RATE_LIMIT_SALT`, and
   `SYNAC_REVALIDATE_SECRET`. `SYNAC_RATE_LIMIT_SALT` is required in
   production and has no fallback, so the app fails without it. The Convex
   deployment needs `SYNAC_CONVEX_SERVICE_KEY` set to the same value as the
   web app.

## Mitigation

- Roll back the last Vercel deploy if the outage correlates with a web change.
- Revert the last content or code PR if the outage correlates with a sync. The
  next sync converges.
- Stale-but-serving content is degraded, not down. Fix the sync at leisure.
