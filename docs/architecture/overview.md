# Architecture overview

SynAc is a **GitOps content system**: the repository is the source of truth for
everything the site serves, and the runtime is a thin, read-mostly serving
layer. There are no user accounts anywhere.

```
content/  ──compile──▶  tools/content  ──sync──▶  Convex  ◀──queries──  apps/web
   ▲                                                                      (Next.js)
   │ PRs (humans + scheduled ingest workflow)
tools/ingest
```

## Content plane (git)

- `content/sources/*.json` — source registry: license terms, attribution
  requirements, trust tier, ingest adapter config. A source contributes
  content only when enabled with complete license terms.
- `content/tags.json` — curated taxonomy.
- `content/generated/<source>.json` — machine-owned per-source bundles
  (entries, senses, citations). Written only by `tools/ingest`; deterministic,
  so unchanged upstream content produces zero diff.
- `content/overrides/{term,acronym}/<slug>.json` — sparse human curation:
  summaries, tags, aliases, relationships, editorial senses, and suppression
  (the takedown mechanism).
- `content/redirects.json` — slug redirects for renamed entries.

`tools/content` validates all of it (`pnpm content:check`, run on every PR)
and compiles bundles + overrides into normalized rows with resolved citations,
search documents, and denormalized counts. The compiler output carries a
`contentVersion` hash of the whole dataset.

## Sync (CI → Convex)

On every push to `main`, the deploy workflow runs `npx convex deploy` and then
pushes the compiled dataset through chunked, idempotent internal mutations
(`convex/sync.ts`), stamping every row with the new `contentVersion` and then
pruning rows whose stamp is stale. Re-running a sync is a no-op; reverting a
content PR converges the deployment back. Runtime tables are never touched by
sync.

## Serving plane (Convex + Next.js)

- `convex/schema.ts` — native `v.id()` relations and literal-union types.
  Content tables (sources, tags, entries, senses, entryTags, entrySources,
  relationships, redirects) are populated only by sync. Runtime tables
  (entryViews) are keyed by entry natural keys so they survive re-syncs.
- Public queries (`publicEntries`, `publicBrowse`, `tags`, `sources`,
  `search`, `sitemap`) are indexed, bounded reads; counts are denormalized at
  compile time, never computed by scanning.
- Anonymous runtime mutations (`views.trackView`, `rateLimit.consume`) require
  `SYNAC_CONVEX_SERVICE_KEY`, held only by the Next.js server, and compute all
  timestamps server-side. Rate limiting uses the official
  `@convex-dev/rate-limiter` component.
- `apps/web` is a server-first Next.js app; it imports typed function
  references from `convex/_generated/api` via `src/lib/convex.ts`.

## Ingest plane (GitHub Actions)

`tools/ingest` holds one adapter per source (NIST CSRC, NICCS, RFC 4949,
OWASP, MITRE ATT&CK) plus an SSRF-safe fetcher. Adapters are pure producers:
fetch → parse → emit a bundle. A weekly scheduled workflow (`ingest.yml`)
regenerates bundles and opens a pull request only when something changed;
review happens as ordinary PR review.

## Decisions of record

- **No accounts, no admin surface.** All write paths are pull requests;
  GitHub authenticates contributors; git history is the audit log; takedowns
  are `suppress` overrides. (Replaced the former Clerk + admin UI + RBAC
  tables.)
- **Native Convex IDs.** The former string-UUID `id` + `by_appId`
  compatibility layer from the Postgres era was removed in the GitOps
  cutover; the deployment is rebuilt from repo content, so data migrations
  are replaced by re-syncs.
- **Ingest runs in CI, not in Convex.** Adapters stay plain, testable Node
  code with no runtime limits, and their output is reviewable before it
  publishes.
