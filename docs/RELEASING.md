# Releasing SynAc

This repo targets a first public release at `v0.1.0`.

## Pre-flight

- Ensure CI is green on `main`.
- Ensure DB migrations are ready to deploy (`packages/db/prisma/migrations/*`).
- Confirm required env vars are present in production (see `.env.example`).

## Release steps (v0.1.0)

1. Run the local gate:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
2. Bump versions to `0.1.0` (root + workspaces).
3. Deploy:
   - Apply DB migrations in production using Prisma deploy (`pnpm --filter @synac/db db:migrate:deploy`).
   - Deploy `@synac/web` and `@synac/worker`.
4. Verify:
   - Smoke browse/search/entry pages.
   - Smoke admin auth + `/admin` loads.
   - Run one manual ingest and approve one item.
5. Tag and push:
   - `git tag -a v0.1.0 -m "v0.1.0"`
   - `git push --tags`

