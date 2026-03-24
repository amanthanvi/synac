# Runbook: Search broken

## Triage

- Confirm `/api/v1/search` health and latency.
- Check Postgres extensions and indexes (FTS + `pg_trgm`).
- Measure search-index coverage before making changes:
  - `pnpm --filter @synac/db db:search:rebuild`
  - Review the `before.missingEntryIds` and `before.orphanedEntryIds` fields in the JSON output.

## Mitigation

- Temporarily direct users to browse pages.
- Rebuild the search index if coverage is incomplete or stale:
  - `pnpm --filter @synac/db db:search:rebuild`
- Re-check coverage after rebuild and confirm `after.missingEntryIds` / `after.orphanedEntryIds` are empty.
- If coverage still looks wrong after rebuild:
  - inspect recent publish/ingest activity,
  - verify the `synac_refresh_entry_search` DB function still exists,
  - verify entry/sense/variant triggers are present in the database.

