# Releasing SynAc

This repo is released at `v0.1.1` and targets a `v0.1.x` release cadence.

## Pre-flight

- Ensure CI is green on `main`.
- CodeQL uploads results to GitHub Code Scanning.
- Ensure DB migrations are ready to deploy (`packages/db/prisma/migrations/*`).
- Confirm required env vars are present in production (see `.env.example`).
- If using staging-first ingest:
  - staging DB/service is deployed and migrated,
  - staging worker runs in `SYNAC_WORKER_MODE=ingest`,
  - prod worker runs in `SYNAC_WORKER_MODE=promotion` with `SYNAC_STAGING_DATABASE_URL` configured.

## Adding sources (staging-first ingest)

- Upsert the new Source Registry entries in **prod** (Admin → Sources or `pnpm db:seed:content`).
- Ensure prod worker allowlists the new slugs for sync → staging (`SYNAC_STAGING_SOURCE_ALLOWLIST`).
- If the change includes a new ingest adapter, deploy `worker` in `staging` before triggering runs.
- Trigger a staging ingest run (Admin → Ingest) and verify:
  - staging worker logs `ingest.run.success`,
  - prod worker logs `promotion.import_runs.ok`,
  - Tier‑1 sources: prod worker logs `autopublish.tier1.ok`.

## Release steps

1. Run the local gate:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
2. Bump versions (root + workspaces).
3. Deploy (Railway):
   - Apply DB migrations in production (run inside Railway so `postgres.railway.internal` resolves):
     - `railway ssh -e production -s synac pnpm --filter @synac/db db:migrate:deploy`
   - Deploy `synac` (web) and `worker`
   - One-time (new DB): seed roles/users and optional starter content:
     - `railway ssh -e production -s synac pnpm db:seed`
     - `railway ssh -e production -s synac pnpm db:seed:content`
4. Verify:
   - Smoke browse/search/entry pages.
   - Smoke admin auth + `/admin` loads.
   - If staging-first ingest is enabled: trigger one ingest run from prod `/admin/ingest` and verify promotion/autopublish behavior.
5. Tag and push (for tagged releases):
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push --tags`
