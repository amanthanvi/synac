# Runbook: DB restore (PITR)

## When to use

- Data corruption, accidental deletion, or confirmed compromise.

## Steps

1. Stop background writes:
   - Scale the `worker` service to **0 replicas** in Railway. This is what stops
     ingest and promotion; there is no application-level read-only mode.
   - Disable the sources involved: Admin → Sources, or
     `POST /api/v1/admin/sources/{id}/disable`.
   - If admin writes must stop too, take the web service down or remove the
     affected accounts from `SYNAC_ADMIN_EMAILS` / `SYNAC_EDITOR_EMAILS` and
     redeploy. Access is allowlist-driven, so shrinking the allowlist is the
     lever.
2. Restore the database to the desired point-in-time (provider tooling).
3. Verify:
   - migrations match the expected state
     (`pnpm --filter @synac/db db:migrate:deploy` should be a no-op),
   - sample content loads in web,
   - `GET /api/healthz` succeeds.
4. Reindex (if needed):
   - rebuild Postgres FTS/trigram indexes if the restore involved old snapshots:
     `pnpm --filter @synac/db db:search:index:rebuild`, then re-check with
     `db:search:index:check`.
5. Purge cached pages so the site stops serving pre-restore output:

   ```bash
   curl -X POST "$SITE_URL/api/v1/internal/revalidate" \
     -H "Authorization: Bearer $SYNAC_REVALIDATE_SECRET" \
     -H 'Content-Type: application/json' \
     -d '{"tags":["entries","tags","sources","search"]}'
   ```

6. Resume writes:
   - scale the `worker` service back up,
   - re-enable the sources you disabled,
   - restore any allowlist entries you removed.

## Follow-up

- Record restore duration and any manual steps in the incident ticket; feed them
  back into `docs/BACKUPS.md`.
