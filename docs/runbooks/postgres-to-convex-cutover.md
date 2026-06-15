# Production Postgres-to-Convex Cutover

This runbook prepares a Railway Postgres logical export for Convex import. It does not require live Railway, Convex, or Vercel access during local rehearsal. Do not run production import commands until the freeze window is approved.

## Preserved Data

The transformer preserves legacy UUIDs in Convex `id` fields for:

- `users`, `roles`, `user_roles`
- `entries`, `senses`, `sense_examples`, `entry_variants`, `entry_slug_history`
- `tags`, `tag_slug_history`, `entry_tags`
- `entry_relationships`
- `sources`, `source_documents`, `citations`, `field_provenance`
- `entry_search`, `entry_views`
- `ingest_runs`, `ingest_items`
- `audit_events`, `takedown_cases`
- `rate_limit_buckets`

Composite Prisma keys (`entry_tags`, `user_roles`) get deterministic Convex `id` values. The generated `id-map.json` records those mappings.

`entry_search` is imported if exported. If it is missing, the transformer synthesizes Convex `entrySearch` rows from published entries, published senses, and variants using the same document shape as `convex/data.ts`.

## Intentionally Not Preserved

- Prisma migrations and Postgres triggers: superseded by Convex schema/functions.
- pg-boss runtime queue state: superseded by Convex crons/scheduled functions; pending jobs should be drained or frozen before export.
- Railway staging/prod promotion state: superseded by direct Convex import/rehearsal.
- Binary source snapshots: only `source_documents.snapshot_storage_uri` metadata is in the database export. Copy object storage separately if snapshots are required.
- Stale `rate_limit_buckets`: the transformer supports them, but buckets older than 24 hours are usually not worth importing because they can throttle users after cutover for no product value.

## Backup And Export

Run these from a controlled operator machine with production credentials. Keep the raw export and Convex artifacts encrypted at rest.

```bash
export DATABASE_URL='postgresql://...'
export EXPORT_DIR="$PWD/.migration/pg-export-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$EXPORT_DIR"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file "$EXPORT_DIR/full-backup.dump"
```

Export JSONL with stable ordering. This format is preferred because JSONB, booleans, and timestamps keep their intended shape.

```bash
tables=(
  roles users user_roles
  entries entry_slug_history entry_variants senses sense_examples
  tags tag_slug_history entry_tags entry_relationships
  sources source_documents citations field_provenance
  entry_search entry_views
  ingest_runs ingest_items
  audit_events takedown_cases rate_limit_buckets
)

for table in "${tables[@]}"; do
  psql "$DATABASE_URL" \
    --set=ON_ERROR_STOP=1 \
    --command="\copy (select row_to_json(t) from (select * from public.${table} order by 1) t) to '${EXPORT_DIR}/${table}.jsonl'"
done
```

If JSONL export is blocked, use CSV with headers:

```bash
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --command="\copy public.entries to '${EXPORT_DIR}/entries.csv' with (format csv, header true)"
```

Repeat the CSV command for each table.

## Transform

Run locally in this repository:

```bash
export CLERK_JWT_ISSUER_DOMAIN='https://clerk.synac.app'
export SYNAC_ADMIN_EMAILS='admin@example.com'

node scripts/postgres-to-convex.mjs \
  --input "$EXPORT_DIR" \
  --output .migration/convex-import \
  --clerk-issuer-domain "$CLERK_JWT_ISSUER_DOMAIN" \
  --admin-emails "$SYNAC_ADMIN_EMAILS" \
  --zip
```

Outputs:

- `.migration/convex-import/convex-import/<table>/documents.jsonl`
- `.migration/convex-import/convex-import.zip`
- `.migration/convex-import/id-map.json`
- `.migration/convex-import/manifest.json`
- `.migration/convex-import/validation-report.json`
- `.migration/convex-import/import-commands.sh`

## Validate Artifacts

Run validation independently after every transform:

```bash
node scripts/validate-convex-import.mjs \
  --input .migration/convex-import/convex-import \
  --admin-emails "$SYNAC_ADMIN_EMAILS" \
  --report .migration/convex-import/validation-report.json
```

Required checks before import:

- `validation-report.json.errors` is empty.
- Counts match source exports for preserved tables.
- Published, non-deleted entries have `entrySearch` rows.
- Sample `entrySearch.searchDocument` includes title/slug/sense text.
- Admin allowlist emails exist and have `ADMIN` role.
- OIDC users that need direct Convex ownership checks have `tokenIdentifier`.
- Foreign key checks for entry, tag, source, ingest, audit, and takedown relations are clean.

## Import Rehearsal

Use a non-production Convex deployment.

```bash
export CONVEX_DEPLOYMENT='dev'

npx convex import \
  --deployment "$CONVEX_DEPLOYMENT" \
  .migration/convex-import/convex-import.zip \
  --replace
```

Rebuild search if needed:

```bash
npx convex run --deployment "$CONVEX_DEPLOYMENT" data:rebuildSearchIndex
```

Run app checks against the rehearsal deployment:

```bash
NEXT_PUBLIC_CONVEX_URL='https://<dev-deployment>.convex.cloud' \
CONVEX_URL='https://<dev-deployment>.convex.cloud' \
pnpm gate
```

Smoke sample records:

- Public search for a known acronym and a known term.
- Browse pages by first letter and recent entries.
- Entry detail page with senses, variants, tags, citations, and relationships.
- Admin login using a Clerk allowlisted admin.
- Admin source list and source detail.
- Admin ingest run list and item detail.
- Takedown case list and detail.

## Freeze Window

Before final export:

- Announce write freeze.
- Disable admin editing, manual ingest triggers, and legacy worker starts.
- Let in-flight ingest and moderation writes finish or explicitly abandon them.
- Capture final `pg_dump`.
- Capture final JSONL/CSV export.
- Run transformer and validation again.
- Keep the old Railway database online but read-only until post-cutover acceptance.

## Production Import

Set production Convex environment variables before import/deploy:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN 'https://clerk.synac.app' --prod
```

Required Vercel production variables:

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `SYNAC_ADMIN_EMAILS`
- `SYNAC_EDITOR_EMAILS`

Final import:

```bash
npx convex import \
  --prod \
  .migration/convex-import/convex-import.zip \
  --replace
```

Deploy the cutover app after import and environment verification. Keep legacy `DATABASE_URL`, `SYNAC_STAGING_DATABASE_URL`, and pg-boss variables absent from active runtime config.

## Post-Import Smoke

Immediately verify:

- `npx convex run --prod data:rebuildSearchIndex` returns expected published-entry count.
- Public search returns expected entries for known terms.
- Public browse/recent/source/tag pages load.
- Admin allowlisted Clerk user can sign in and receives expected role.
- Admin entry edit, tag edit, source enable/disable, ingest trigger, and takedown pages load.
- View tracking mutation succeeds without Postgres.
- Rate-limit behavior is normal; clear imported stale buckets if users are throttled.
- Error logs show no `DATABASE_URL`, `SYNAC_STAGING_DATABASE_URL`, Prisma, or pg-boss runtime failures.

Rollback path: repoint Vercel to the previous deployment and keep Railway Postgres read-only until the rollback decision is closed.
