# Runbook: Search broken

Search is served by `convex/search.ts` over the `entries` table's search
index; search documents are compiled into `content/` and synced with entries.

## Triage

- Confirm `/api/v1/search?q=<term>` health and latency.
- Check `npx convex run sync:status --prod`. A stale `contentVersion` or low
  `entryCount` means the last sync failed. Check the `Deploy` workflow.
- Check Convex dashboard logs for `search:search` errors.

## Mitigation

- Failed sync: push an empty commit to `main` to run the Deploy workflow
  again: `git commit --allow-empty -m "chore: redeploy" && git push`.
- Correct in the API but stale on pages: the cached pages did not revalidate.
  Check that the revalidate step of the Deploy workflow succeeded, then push
  an empty commit to `main` to run it again.
- Bad search documents: fix in `tools/content/src/compile.ts` (search
  documents are built at compile time), merge, and let the sync republish.
