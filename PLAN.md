# SynAc v0.1.0 — Execution Plan (PLAN.md)

Last updated: 2026-01-03

This is the living implementation tracker for `SPEC.md`.

## Decisions (locked for v0.1.0)

- Auth: **Clerk**
- DB + migrations: **Prisma**
- Package manager: **pnpm**
- Code license: **MIT**
- Target frontend: **Next.js (App Router) + TypeScript**
- Search: **Postgres FTS + pg_trgm**
- Job queue: **pg-boss**
- Hosting: **Railway**

## Working agreement

- Small/medium diffs.
- Commit + push frequently (same branch).
- Keep code aligned with `SPEC.md`; when reality diverges, update `SPEC.md` (don’t ship undocumented behavior).

## Post-release hardening — v0.1.0 functional on Railway

- [x] Canonical prod domain confirmed: `synac.app` (no `synac.io` cutover)
- [x] Fix Next prerender + CSP nonce mismatch (force-dynamic for static pages so nonce is present)
- [x] Migrate middleware to App Router `src/proxy.ts` with `clerkMiddleware()`
- [x] Expand CSP allowlist for Clerk domains (`*.clerk.com`, `*.clerk.dev`, `*.clerk.accounts.dev`, custom domain)
- [ ] Railway env vars (dev+prod): `NEXT_PUBLIC_SITE_URL`, `SYNAC_ADMIN_EMAILS`, `SYNAC_EDITOR_EMAILS`
- [ ] Railway secrets (dev+prod): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [ ] Seed roles/users (dev+prod): allowlist bootstrap → DB roles
- [ ] Smoke test (Chrome DevTools MCP): public browse/search, sign-in/up, `/admin` authz, worker health

## Phase 0 — Repo bootstrap (foundation)

- [x] Create monorepo structure (`apps/*`, `packages/*`, `docs/*`)
- [x] Add root tooling: TypeScript, lint/format, tests
- [x] Add CI
- [x] Add `README.md`, `LICENSE`, `CONTRIBUTING.md`
- [x] Establish env conventions: `.env.example`, required vars

## Phase 1 — Data model + migrations (authoritative)

- [x] Implement Prisma schema for §9 tables + enums
- [x] Enable Postgres extensions (CITEXT, pg_trgm)
- [x] Add seed: roles + initial admin bootstrap (email allowlist-based)
- [x] Add query layer + transactions (`packages/db`)

## Phase 2 — Public web (FR-001..FR-011)

- [x] Public routes per §8 (home, browse, entry pages, tags, sources, recent, trending, about/legal, changelog+RSS)
- [x] Markdown rendering (no raw HTML) + strict sanitization
- [x] Citations + attribution rendering (per-sense + per-source directory)
- [x] Search (FR-009/010): ranking + typo policy + pagination
- [x] SEO: canonical, robots.txt, sitemap index, JSON-LD
- [x] A11y: WCAG 2.2 AA pass on key flows

## Phase 3 — Admin (FR-012..FR-016)

- [x] Clerk auth integration (OIDC/MFA enforced via Clerk policy)
- [x] RBAC bootstrap: email allowlist → DB roles (`ADMIN`, `EDITOR`, `VIEWER`)
- [x] Entry + sense editor: drafts, publish/archive, reorder senses
- [x] Tags: create/rename/merge + assign to entries
- [x] Publish quality gates: citations per sense (or Editorial + rationale)
- [x] Audit events for entry/sense mutations + entry rollback (Admin-only)
- [x] Admin audit log page + filters
- [x] Admin sources UI: create/edit/enable/disable + verify metadata
- [x] Admin API routes: audit + sources
- [x] Admin API routes: entries
- [x] Admin API routes: ingest

## Phase 4 — Ingest system (FR-100..FR-111)

- [x] Source Registry (license/allowed_use/attribution required before ingest)
- [x] SSRF-safe acquisition (allowlist, redirect policy, IP blocks, limits, timeouts)
- [x] Scheduling + incremental ingest (per-source cron + content-hash skip + force reprocess)
- [x] Pipeline stages + persistence: extract → normalize → dedupe → enrich → validate
- [x] License gate PASS/WARN/FAIL enforcement
- [x] Human review queue UI: diff, approve/edit/reject
- [x] Initial source adapters: NIST, MITRE ATT&CK, OWASP
- [x] Takedown workflow: disable source, purge derived content, 404/308 behavior

## Phase 5 — Ops, security, testing, release

- [x] Security headers + CSP, rate limiting, request IDs, log redaction
- [x] Observability: structured logs + request IDs (log-based metrics)
- [x] Backups + restore drill checklist
- [x] CI: lint/typecheck/tests + CodeQL + dependency scan + SBOM artifact
- [x] Release: bump versions + tag `v0.1.0`

## Spec deltas log (keep short)

- 2026-01-02: Added `tag_slug_history` to §9 (supports tag slug redirects/renames/merges).
- 2026-01-02: Clarified stable sense fragment IDs (`#sense-<sense_id>`) and permanent redirects as 308.
- 2026-01-02: Added ingest per-item `stage_outputs` and `license_gate_reason`, plus field provenance `content_mode`.
- 2026-01-02: Added per-source ingest cron schedule (`sources.cron_schedule`) and manual force reprocess toggle.
- 2026-01-02: Added takedown and safety tables: `takedown_cases`, `rate_limit_buckets`, and `source_documents.do_not_use*`.
