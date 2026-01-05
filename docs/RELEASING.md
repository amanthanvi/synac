# Releasing SynAc

This repo is released at `v0.1.0` and targets a `v0.1.x` release cadence.

## Pre-flight

- Ensure CI is green on `main`.
- Ensure DB migrations are ready to deploy (`packages/db/prisma/migrations/*`).
- Confirm required env vars are present in production (see `.env.example`).
- If using staging-first ingest:
  - staging DB/service is deployed and migrated,
  - staging worker runs in `SYNAC_WORKER_MODE=ingest`,
  - prod worker runs in `SYNAC_WORKER_MODE=promotion` with `SYNAC_STAGING_DATABASE_URL` configured.

## Release steps

1. Run the local gate:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
2. Bump versions (root + workspaces).
3. Deploy (Railway):
   - Apply DB migrations in production using Prisma deploy: `pnpm --filter @synac/db db:migrate:deploy`
   - Deploy `synac` (web) and `worker`
4. Verify:
   - Smoke browse/search/entry pages.
   - Smoke admin auth + `/admin` loads.
   - If staging-first ingest is enabled: trigger one ingest run from prod `/admin/ingest` and verify promotion/autopublish behavior.
5. Tag and push (for tagged releases):
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push --tags`
