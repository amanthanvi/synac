# Backups & Restore

SynAc uses Postgres as the source of truth. Backups are mandatory for production.

## Backup policy (production)

- Postgres:
  - PITR enabled.
  - Automated daily snapshots.
  - Targets: RPO ≤ 15 minutes, RTO ≤ 2 hours.
- Object storage (if snapshotting is enabled for any source):
  - Versioning enabled.

## Restore drill checklist (quarterly)

1. Create an incident ticket (even for drills) and record:
   - start time, operator, target environment.
2. Restore Postgres to a point-in-time into an isolated environment.
3. Verify:
   - schema is current (all migrations applied),
   - basic queries succeed,
   - search still functions (reindex if needed),
   - worker can start and process one ingest run.
4. Document:
   - restore duration,
   - any manual steps,
   - remediation tasks.

