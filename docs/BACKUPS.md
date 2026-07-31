# Backups & Restore

The repository itself is the primary backup: all content is in `content/`,
and the production Convex deployment can be rebuilt from `main` at any time
by running the `Deploy` workflow (functions + full content sync).

## What still needs backing up

- **Convex deployment**: enable scheduled backups in the Convex dashboard
  (Settings → Backups). These cover runtime data (view counts) and provide a
  fast restore path.
- **GitHub**: the repo is the source of truth; protect `main` (branch
  protection + required CI) and keep CODEOWNERS current.

## Restore

1. Restore the latest Convex backup (dashboard), or start from an empty
   deployment.
2. Run the `Deploy` workflow from `main` — it redeploys functions and syncs
   the full content dataset (idempotent).
3. Verify with `npx convex run sync:status --prod` and a public smoke test.

Runtime view counts restored from a backup may be slightly stale; that is
acceptable degradation.
