# Releasing SynAc

This document is version-agnostic on purpose. The current version lives in the
root `package.json`; `pnpm version:check` asserts that every workspace manifest
and `CITATION.cff` agree with it.

## Required CI checks

A release candidate must have all of these green on `main`:

| Workflow       | Job / check                                                                       |
| -------------- | --------------------------------------------------------------------------------- |
| `ci.yml`       | `pnpm version:check`                                                              |
| `ci.yml`       | `prisma validate` + `pnpm --filter @synac/db db:migrate:drift` (exits 2 on drift) |
| `ci.yml`       | `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`           |
| `ci.yml`       | Coverage job (artifacts uploaded; thresholds on the `packages/db` query layer)    |
| `quality.yml`  | Playwright + axe (no serious/critical violations) and Lighthouse CI budgets       |
| `codeql.yml`   | CodeQL `security-extended`, results in Code Scanning                              |
| `security.yml` | gitleaks, `pnpm audit --audit-level high`, CycloneDX SBOM artifact                |
| `docs.yml`     | lychee link check                                                                 |

`pnpm lint:strict` (`--max-warnings=0`) runs but is advisory while the
type-aware backlog in `apps/worker` is cleared. See `PLAN.md`.

## Required environment variables

Full list with comments: `.env.example`. Production must have all of these set:

| Variable                                                 | Notes                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | Production Postgres.                                                          |
| `NEXT_PUBLIC_SITE_URL`                                   | `https://synac.app`.                                                          |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Admin auth.                                                                   |
| `SYNAC_ADMIN_EMAILS`                                     | Comma-separated allowlist; also `SYNAC_EDITOR_EMAILS`, `SYNAC_VIEWER_EMAILS`. |
| `SYNAC_RATE_LIMIT_SALT`                                  | Required in prod. Long random string.                                         |
| `SYNAC_TRUSTED_PROXY_HOPS`                               | `1` behind Railway's edge.                                                    |
| `SYNAC_REVALIDATE_SECRET`                                | Bearer token for the cache purge endpoint. Empty disables it.                 |
| `SYNAC_WORKER_MODE`                                      | `ingest` on staging, `promotion` on prod.                                     |
| `SYNAC_STAGING_DATABASE_URL`                             | Prod worker, for staging-first promotion.                                     |
| `SYNAC_STAGING_SOURCE_ALLOWLIST`                         | Source slugs synced prod → staging.                                           |
| `SYNAC_AUTOPUBLISH_TIER1`                                | Defaults to **false**. Opt in deliberately.                                   |
| `SYNAC_AUTOPUBLISH_WARN`                                 | Defaults to **false**. Allows WARN-gated entries to publish.                  |

## Per-service start commands (Railway)

| Service  | Start command                    |
| -------- | -------------------------------- |
| `synac`  | `pnpm --filter @synac/web start` |
| `worker` | `node apps/worker/dist/index.js` |

`railway.json` sets `healthcheckPath: /api/healthz` with a 60s timeout and an
`ON_FAILURE` restart policy (max 5 retries).

## Pre-flight

- CI green on `main` (table above).
- DB migrations ready to deploy (`packages/db/prisma/migrations/*`) and the
  drift check passing.
- Required env vars present in production.
- If using staging-first ingest:
  - staging DB/service deployed and migrated,
  - staging worker in `SYNAC_WORKER_MODE=ingest`,
  - prod worker in `SYNAC_WORKER_MODE=promotion` with
    `SYNAC_STAGING_DATABASE_URL` configured.

## Adding sources (staging-first ingest)

- Upsert the new Source Registry entries in **prod** (Admin → Sources or
  `pnpm db:seed:content`).
- Ensure prod worker allowlists the new slugs for sync → staging
  (`SYNAC_STAGING_SOURCE_ALLOWLIST`).
- If the change includes a new ingest adapter, deploy `worker` in `staging`
  before triggering runs.
- Trigger a staging ingest run (Admin → Ingest) and verify:
  - staging worker logs `ingest.run.success`,
  - prod worker logs `promotion.import_runs.ok`,
  - Tier‑1 sources: prod worker logs `autopublish.tier1.ok`.

## Release steps

1. Run the local gate:
   - `pnpm gate` (format → lint → typecheck → test → build)
   - `pnpm version:check`
2. Bump the version in **every** workspace `package.json` plus `CITATION.cff`,
   then re-run `pnpm version:check`.
3. Update changelogs:
   - Repo: `CHANGELOG.md`
   - Site (curated): `apps/web/src/lib/changelog.ts`
4. Deploy (Railway):
   - Apply DB migrations in production (run inside Railway so
     `postgres.railway.internal` resolves):
     - `railway ssh -e production -s synac pnpm --filter @synac/db db:migrate:deploy`
   - Deploy `synac` (web) and `worker`.
   - One-time (new DB): seed roles/users and optional starter content:
     - `railway ssh -e production -s synac pnpm db:seed`
     - `railway ssh -e production -s synac pnpm db:seed:content`
5. **Purge the cache** (see below). Content is served from tag-scoped caches, so
   a migration or content change is not visible until the tags are purged.
6. Verify:
   - `curl -fsS https://synac.app/api/healthz`
   - Smoke browse/search/entry pages; check one sense fragment link.
   - Smoke admin auth + `/admin` loads.
   - `curl -fsS https://synac.app/api/v1/openapi.json | head`
   - If staging-first ingest is enabled: trigger one ingest run from prod
     `/admin/ingest` and verify promotion/autopublish behaviour.
7. Tag and push:
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push origin vX.Y.Z`

## Cache purge

Public pages render dynamically over tag-scoped caches. Purge after a deploy
that changes content, and any time the site looks stale:

```sh
curl -fsS -X POST https://synac.app/api/v1/internal/revalidate \
  -H "Authorization: Bearer $SYNAC_REVALIDATE_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"tags":["entries","tags","sources","search"]}'
```

Purge the narrowest tag that covers the change: `entries` after a publish,
`sources` after a source edit, `tags` after a taxonomy change, `search` after a
reindex.

## Rollback

Pick the smallest rollback that fixes the problem.

### App rollback (bad deploy)

Railway keeps previous deploys. In the Railway dashboard, open the service
(`synac` or `worker`) → Deployments → the last known-good deploy →
**Redeploy**. Then purge the cache and re-verify `/api/healthz`.

A migration that has already been applied is **not** reverted by an app
rollback. If the previous build cannot run against the new schema, roll forward
with a corrective migration instead. See `docs/runbooks/db-restore.md`.

### Content rollback (bad entry or sense)

Admin → Entries → the entry → **Revisions** → restore the prior revision. This
is audited and does not require a deploy. Purge the `entries` tag afterwards.

### Source rollback (bad ingest)

1. Admin → Sources → **Disable** the source. This stops further ingest and
   promotion for it.
2. Purge derived content for that source (Admin → Takedown, or the
   source-purge path in `docs/runbooks/ingest-bad-content.md`).
3. If ingest must stop entirely, scale the `worker` service to 0 replicas in
   Railway.
4. Purge the `entries`, `sources` and `search` tags.
