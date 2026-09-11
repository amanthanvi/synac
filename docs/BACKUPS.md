# Backups & Restore

Postgres is the source of truth. Everything that must survive an incident lives
there: entries, senses, tags, the Source Registry, citations, ingest runs, and
audit events. Backups are mandatory for production.

## What is backed up

**Postgres, and only Postgres.** SynAc has no object-storage tier. There is no
bucket to version and nothing to back up outside the database.

Retention in production:

- Railway's managed Postgres backups (the provider's automated backups and
  point-in-time recovery for the plan in use).
- Periodic `pg_dump` to storage you control, as an off-provider copy:

  ```bash
  pg_dump --format=custom --no-owner --no-privileges \
    "$DATABASE_URL" > "synac-$(date -u +%Y%m%dT%H%M%SZ).dump"
  ```

  Restore with `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL"`.

Targets: RPO ≤ 15 minutes, RTO ≤ 2 hours. Verify that the provider plan
actually delivers the RPO before quoting it in an incident.

## Content snapshots

Snapshotting upstream source content is **per-source and off by default**.
`Source.snapshotAllowed` is `Boolean @default(false)`
(`packages/db/prisma/schema.prisma`), and each `SourceDocument` carries the
`snapshotAllowed` value it was ingested under, so the decision is recorded per
document rather than inferred later.

Two consequences worth stating plainly:

- A source's license has to permit retaining a copy before the flag is turned
  on. See `docs/content/licensing.md`.
- No snapshot bodies are stored today. Every ingest adapter writes
  `snapshotAllowed: false` and `snapshotStorageUri: null`, so what SynAc retains
  for an upstream document is its URL, content type, fetch time, and
  `content_sha256`. That is enough to detect change and prove what was seen, but
  not enough to reconstruct the page. Citations link back to the live source.

If snapshot storage is ever enabled, the backup story for it has to be written
here at the same time.

## Restore drill checklist (quarterly)

1. Create an incident ticket (even for drills) and record:
   - start time, operator, target environment.
2. Restore Postgres to a point-in-time into an isolated environment.
3. Verify:
   - schema is current (all migrations applied, so `db:migrate:deploy` is a
     no-op),
   - basic queries succeed,
   - search still functions
     (`pnpm --filter @synac/db db:search:index:check`; reindex with
     `db:search:index:rebuild` if coverage is incomplete),
   - the worker can start and process one ingest run.
4. Document:
   - restore duration,
   - any manual steps,
   - remediation tasks.

For a real restore, follow `docs/runbooks/db-restore.md`. It covers freezing
writes and purging cached pages, which a drill in an isolated environment does
not need.
