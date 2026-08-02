# Runbook: Search broken

Search is served by `convex/search.ts` over the `entries` table's search
index; search documents are compiled into `content/` and synced with entries.

## Triage

- Confirm `/api/v1/search?q=<term>` health and latency.
- Check `npx convex run sync:status --prod` — a stale `contentVersion` or low
  `entryCount` means the last sync failed; check the `Deploy` workflow.
- Check Convex dashboard logs for `search:search` errors.

## Mitigation

- Failed sync: re-run the `Deploy` workflow (`workflow_dispatch`).
- Bad search documents: fix in `tools/content/src/compile.ts` (search
  documents are built at compile time), merge, and let the sync republish.
