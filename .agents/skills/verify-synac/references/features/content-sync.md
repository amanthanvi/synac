# Content sync

Pushes the compiled corpus into the local Convex deployment and checks tag counts.

## Sub-features

- push: `pnpm --filter @synac/content-tools sync`
- status: stdout `sync status:` and `tag convergence: verified`
- read-back: the site search returns seeded rows after sync

## How to get to it (user POV)

A maintainer runs sync after `npx convex dev` and `npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev`. Readers then see the entries on the site.

## Driving it with the CLI

`pnpm verify:launch` runs sync once and copies stdout to `/tmp/synac-verify-<hash>/evidence/cli-sync.log`. `<hash>` is the first 12 hex characters of sha256 of the repo root.

```bash
pnpm --filter @synac/content-tools sync
```

The log contains `tag convergence: verified` and `to the local dev deployment`. Then doctor `READY` is the read-back: `GET /api/v1/search?q=soc` has `meta.total` greater than 0, and `/term/access-control` renders.

`--prod` targets a production deployment and needs `CONVEX_DEPLOY_KEY`. The verify skill does not pass `--prod`. A production sync is `INCONCLUSIVE` in this environment.

## Gotchas

- Sync against a Convex process this skill did not start is refused by launch. Do not point sync at a shared deployment to "save time".
- Re-running sync is idempotent. A second `tag convergence: verified` still counts. The proof is the line plus a search that returns data.
- If the service key is unset, sync's Convex calls fail. Launch sets `SYNAC_CONVEX_SERVICE_KEY=local-dev` before sync.
- The command writes records. It does not rewrite `content/generated/`.
