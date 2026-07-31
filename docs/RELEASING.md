# Releasing SynAc

Deployment is continuous: every push to `main` triggers the `Deploy` workflow,
which validates `content/`, deploys the Convex functions, and syncs the
compiled content into the production deployment. Vercel builds the web app
from `main` independently.

## Required configuration

GitHub repository secrets:

- `CONVEX_DEPLOY_KEY` — production deploy key from the Convex dashboard
  (Deployment settings → Deploy keys).

Convex production deployment environment variables:

- `SYNAC_CONVEX_SERVICE_KEY` — random secret shared with the web server.

Vercel environment variables (see `.env.example`):

- `NEXT_PUBLIC_CONVEX_URL`, `SYNAC_CONVEX_SERVICE_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `SYNAC_SESSION_HASH_SALT`, `SYNAC_RATE_LIMIT_SALT`.

## Cutting a versioned release

1. Ensure CI is green on `main`.
2. Update `CHANGELOG.md` (canonical) and mirror the entry in
   `apps/web/src/lib/changelog.ts`.
3. Bump `version` in the root and workspace `package.json` files.
4. Tag: `git tag vX.Y.Z && git push --tags`.

## One-time GitOps cutover (from the pre-content-as-code deployment)

Performed once when this architecture first ships:

1. Export the old production data: `npx convex export --prod --path snapshot.zip`
   (or download a dashboard backup) and keep it as the rollback artifact.
2. Bootstrap `content/` from the snapshot:
   `pnpm --filter @synac/content-tools exec tsx src/bootstrap-from-export.ts <extracted-snapshot-dir>`
   then review, run `pnpm content:check`, and commit.
3. Clear the old tables (dashboard → Data → clear, or restore an empty
   backup) — the new schema cannot validate rows from the old one.
4. Merge to `main`; the deploy workflow pushes the new schema + functions and
   syncs the content in.
5. Verify: `/`, an entry page, `/search?q=…`, `/sources`, and
   `npx convex run sync:status --prod`.
6. Decommission Clerk (delete the application) and remove Clerk env vars from
   Vercel.

## Rollback

- Content problem: revert the offending content PR — the next sync converges
  the deployment to the reverted state.
- Function problem: revert the code PR; the deploy workflow redeploys.
- Catastrophic data problem: restore the latest Convex backup, then re-run
  the sync from `main`.
