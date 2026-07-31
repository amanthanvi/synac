# Runbook: Site down

## Triage

1. Confirm symptoms: all pages 5xx? only search/view APIs? only stale data?
2. Check Vercel deploy status and the latest `Deploy` workflow run.
3. Check Convex dashboard: deployment health, function error logs.
4. Missing env vars are a common cause after infra changes: the web app needs
   `NEXT_PUBLIC_CONVEX_URL` + `SYNAC_CONVEX_SERVICE_KEY`; the deployment
   needs `SYNAC_CONVEX_SERVICE_KEY`.

## Mitigation

- Roll back the last Vercel deploy if correlated with a web change.
- Revert the last content/code PR if correlated with a sync; the next sync
  converges.
- Stale-but-serving content is degraded, not down — fix the sync at leisure.
