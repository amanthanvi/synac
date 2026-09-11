# Runbook: Site down

## Triage

1. Confirm symptoms:
   - public pages 5xx? admin 5xx? only search?
2. Check the health endpoint:
   - `GET /api/healthz` (the same check CI and Railway use). A failure here
     usually means the app cannot reach Postgres.
3. Check deploy status and recent changes:
   - latest GitHub Actions runs
   - last deploy time
4. Check logs:
   - web runtime errors
   - DB connection errors
   - worker logs, if writes or ingest are implicated

## Mitigation

- **Roll back the last deploy** if the outage correlates with it. This is the
  first lever, not the last.
- **Stop background writes.** In Railway, scale the `worker` service to **0
  replicas**. That halts ingest and promotion without touching the web service.
- **Disable the sources involved**, if a specific source is driving the load or
  the bad data: Admin → Sources, or
  `POST /api/v1/admin/sources/{id}/disable` (admin auth required). Disabled
  sources are dropped from the ingest cron on the next schedule sync.
- **Purge cached pages** if the site is serving stale or broken cached output:

  ```bash
  curl -X POST "$SITE_URL/api/v1/internal/revalidate" \
    -H "Authorization: Bearer $SYNAC_REVALIDATE_SECRET" \
    -H 'Content-Type: application/json' \
    -d '{"tags":["entries","tags","sources","search"]}'
  ```

- If the database is the bottleneck, scale it (provider tooling) and check for
  a long-running query or a connection-pool exhaustion pattern.
- If search is the only failing subsystem, follow
  `docs/runbooks/search-broken.md` and point users at the browse routes in the
  meantime.

There is no application-level read-only mode. Do not go looking for one: the
levers above (roll back, scale the worker to 0, disable sources, purge cache)
are the real controls.

## Follow-up

- Root cause analysis + add regression coverage where possible.
- Scale the `worker` service back up and re-enable any sources you disabled.
