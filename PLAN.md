# SynAc v0.1.0 — Execution Plan (PLAN.md)

Last updated: 2026-01-02

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
- [x] Publish quality gates: citations per sense (or Editorial + rationale)
- [x] Audit events for entry/sense mutations + entry rollback (Admin-only)
- [x] Admin audit log page + filters
- [x] Admin sources UI: create/edit/enable/disable + verify metadata
- [x] Admin API routes: audit + sources
- [x] Admin API routes: entries
- [ ] Admin API routes: ingest

## Phase 4 — Ingest system (FR-100..FR-111)

- [ ] Source Registry (license/allowed_use/attribution required before ingest)
- [ ] SSRF-safe acquisition (allowlist, redirect policy, IP blocks, limits, timeouts)
- [ ] Pipeline stages + persistence: extract → normalize → dedupe → enrich → validate
- [ ] License gate PASS/WARN/FAIL enforcement
- [ ] Human review queue UI: diff, approve/edit/reject
- [ ] Initial source adapters: NIST, MITRE ATT&CK, OWASP
- [ ] Takedown workflow: disable source, purge derived content, 410/301 behavior

## Phase 5 — Ops, security, testing, release

- [ ] Security headers + CSP, rate limiting, request IDs, log redaction
- [ ] Observability: structured logs + baseline metrics/tracing
- [ ] Backups + restore drill checklist
- [ ] CI: lint/typecheck/tests + CodeQL + dependency scan + SBOM artifact
- [ ] Release checklist + tag `v0.1.0`

## Spec deltas log (keep short)

- 2026-01-02: Added `tag_slug_history` to §9 (supports tag slug redirects/renames/merges).
- 2026-01-02: Clarified stable sense fragment IDs (`#sense-<sense_id>`) and permanent redirects as 308.
