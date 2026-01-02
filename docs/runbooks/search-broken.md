# Runbook: Search broken

## Triage

- Confirm `/api/v1/search` health and latency.
- Check Postgres extensions and indexes (FTS + `pg_trgm`).

## Mitigation

- Temporarily direct users to browse pages.
- Rebuild indexes if needed.

