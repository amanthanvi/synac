# Backups and restore

The repository itself is the primary backup. All content lives in `content/`,
and the production Convex deployment can be rebuilt from `main` at any time.
Pushing to `main` runs the Deploy workflow, which redeploys the functions and
syncs the full content dataset.

## What still needs backing up

Enable scheduled backups for the Convex deployment in the Convex dashboard,
under Settings then Backups. These cover runtime data, which today is the rate
limiter state. They are a convenience, not the real restore path. There is no
runtime view-count data to lose, because the site does not track views.

GitHub holds the source of truth. Protect `main` with branch protection and
required CI, and keep CODEOWNERS current.

## Restore

1. Restore the latest Convex backup from the dashboard, or start from an empty
   deployment.
2. Push to `main` to run the Deploy workflow. An empty commit is enough:
   `git commit --allow-empty -m "chore: redeploy" && git push`. The sync is
   idempotent and rebuilds the full content dataset.
3. Verify with `npx convex run sync:status --prod` and a public smoke test.

The repository plus a resync is the restore path that matters. A Convex backup
only saves you the rate limiter state, and losing that is acceptable
degradation.
