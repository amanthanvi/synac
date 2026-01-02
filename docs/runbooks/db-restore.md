# Runbook: DB restore (PITR)

## When to use

- Data corruption, accidental deletion, or confirmed compromise.

## Steps

1. Freeze writes:
   - disable ingest scheduling (disable sources or stop worker)
   - temporarily restrict admin write actions
2. Restore DB to desired point-in-time (provider tooling).
3. Verify:
   - migrations match expected state
   - sample content loads in web
4. Reindex (if needed):
   - rebuild Postgres FTS/trigram indexes if restore involved old snapshots.
5. Re-enable writes:
   - restart worker
   - re-enable sources

