# SynAc — Execution Plan (PLAN.md)

Last updated: 2026-02-10

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
- Ingest methodology: **staging-first + automated promotion**

## Working agreement

- Small/medium diffs.
- Commit + push frequently (same branch).
- Keep code aligned with `SPEC.md`; when reality diverges, update `SPEC.md` (don’t ship undocumented behavior).

## v0.2.0 — Full UI/UX Overhaul (“Clinical Reference”)

Goal: Complete public-facing UI redesign. Replace “Signal Ledger” aesthetic with a polished, monospace-forward, dark-leaning developer-documentation aesthetic inspired by Stripe Docs, Vercel Docs, and Tailwind CSS Docs. Authoritative, clean, clinical.

### Design Direction

- **Identity**: “Clinical Reference” — SOC-room precision meets premium developer documentation.
- **Typography**: Geist Sans (body) + Geist Mono (display, labels, metadata, code). Monospace-forward; mono is the hero typeface.
- **Color**: Cool/clinical. Blue-gray palette with electric blue/green accents. No warm tones.
- **Theme**: System-first detection, lean dark (dark is the hero experience). Manual toggle with persistence via `localStorage`.
- **Content density**: Balanced (Vercel-level) — purposeful whitespace, not cavernous, not packed.
- **Brand**: Typographic wordmark only (Geist Mono treatment). Remove shield SVG.
- **Motion**: Deliberate & polished. Page load stagger, smooth accordions, hover micro-interactions. No gratuitous animation.

### Scope

- Public-facing pages only. Admin UI stays functional (future scope).
- Mobile is equal priority — mobile-first responsive.

### Phase 0 — Foundation (Design Tokens + Theme System)

- [x] Replace all CSS custom properties with new clinical palette (dark + light tokens)
- [x] Implement theme toggle with `localStorage` persistence + system detection fallback
- [x] Swap fonts: Instrument Sans/Fraunces/IBM Plex Mono → Geist Sans + Geist Mono (via `next/font/google` or `geist` npm package)
- [x] Establish new spacing/radius/shadow scale (tighter radii, clinical shadows)
- [x] Remove dot-grid, grain overlay, archival paper textures
- [x] Define new background system (clean flat or subtle gradient, no noise)
- [x] Set up reduced-motion support for new motion tokens
- [x] Update selection highlight, focus-visible, and scrollbar styles

### Phase 1 — Page Shell + Navigation

- [x] Unified page shell: consistent max-width container, header spacing, content rhythm across all pages
- [x] Redesign SiteHeader: typographic wordmark (Geist Mono), monospace nav items, integrated search, theme toggle button
- [x] Flatten nav: Terms, Acronyms, Tags, Sources, About (remove Explore dropdown)
- [x] Remove Trending from nav (page axed)
- [x] Redesign command palette (⌘K): search + navigation hub (page links, recent entries, keyboard-first)
- [x] Inline header search with contextual autocomplete results below input
- [x] Minimal utility footer (compact links + copyright, low-profile)
- [x] Mobile nav: slide-out drawer or bottom sheet (replace `<details>` toggle)
- [x] Preserve skip-to-content + keyboard a11y

### Phase 2 — Entry Pages (Core Product)

- [x] Full-width stacked layout (replace left-rail + main content grid)
- [x] Entry header: prominent type badge (TERM vs ACRONYM — clear visual differentiation at scan speed), title, summary
- [x] Metadata section: tags (monochrome border badges), updated date, stands-for, also-known-as
- [x] Multi-sense presentation: card-stack with expandable preview (each sense as card, first 2-3 lines visible, expand on click/tap)
- [x] High-sense (10+): all collapsed except first, smooth accordion animation
- [x] Citations: inline source pills at point-of-use (hover for metadata popup) + academic bibliography section at bottom
- [x] Sticky floating sidebar TOC (appears on scroll, tracks active sense — Stripe/Tailwind pattern)
- [x] Hover preview cards for cross-references (Related, See Also links show floating summary card on hover)
- [x] Per-sense examples styled as code blocks or callout boxes
- [x] Skeleton shimmer loading states for dynamic content
- [x] ViewTracker + EntrySenseHashSync preserved (behavioral, not visual)

### Phase 3 — Browse Pages

- [x] /terms, /acronyms: Hybrid grid + filter (keep alpha A-Z index, add tag filter chips + sort controls + live search overlay)
- [x] Entry type badges prominent in browse list items (scan-speed differentiation)
- [x] Monochrome tag badges throughout
- [x] Pagination (not infinite scroll — SEO-friendly)
- [x] /tags: Tag directory with entry counts, filterable
- [x] /sources: Rich directory cards (source name, citation count, trust tier indicator, latest citation date)
- [x] /sources/{source}: Source detail page with cited entries list
- [x] /recent: Recently updated entries list with relative date indicators

### Phase 4 — Home Page

- [x] Search-forward portal: hero search bar (prominent, centered)
- [x] Recent/featured entries section below search
- [x] Quick-access shortcuts (Browse Terms, Browse Acronyms, Tags)
- [x] No principle cards or primers — let the content speak
- [x] Clean, minimal — Vercel Docs landing energy

### Phase 5 — Supporting Pages

- [ ] /search: Clean results list with entry type badges, summary excerpts, highlighted matches
- [ ] /about: Mission statement + how-to-read-entries guide (replace heavy primer)
- [ ] /changelog: Designed timeline with version cards, date badges, categorized changes (Linear/Raycast style)
- [ ] /legal: Minimal, clean typography

### Phase 6 — Remove Deprecated Pages

- [ ] Delete /trending page and route
- [ ] Remove trending from nav, sitemap, internal links
- [ ] Remove trending analytics aggregation (or defer — may keep data pipeline for future use)
- [ ] Update SPEC.md to reflect removal

### Phase 7 — Polish + Verification

- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile testing (iOS Safari, Android Chrome) — equal priority
- [ ] Lighthouse audit: LCP ≤ 2.5s, CLS ≤ 0.1, INP ≤ 200ms
- [ ] axe-core a11y audit: WCAG 2.2 AA compliance
- [ ] Reduced-motion testing
- [ ] Dark/light theme full visual QA
- [ ] SEO: structured data preserved, sitemaps updated, canonical URLs intact
- [ ] Update SPEC.md §8, §12, §22 with new design decisions

### Acceptance Criteria

- [ ] All public pages render in new “Clinical Reference” aesthetic
- [ ] Theme toggle works with persistence (dark/light/system)
- [ ] Entry pages load with stacked layout + sticky TOC + hover previews
- [ ] Geist Sans + Geist Mono everywhere (no remnants of old fonts)
- [ ] No archival textures (dot-grid, grain, warm amber tones removed)
- [ ] Mobile experience is first-class (not an afterthought)
- [ ] Core Web Vitals within NFR targets
- [ ] WCAG 2.2 AA pass
- [ ] /trending removed
- [ ] SPEC.md fully updated to reflect all design changes

---

## v0.1.5 — UI/UX overhaul (“Signal Ledger”) ✅ COMPLETE

Goal: push the public UI into a memorable, reference-first “signal + paper” aesthetic — instrument-panel header over archival paper, tuned for fast scanning and high trust.

Design direction:
- Typography stack: **Instrument Sans** (body) + **Fraunces** (display) + **IBM Plex Mono** (metadata).
- Default theme: **light** (archival paper + dot grid + grain); auto dark via `prefers-color-scheme: dark`.
- Keep UX rules from v0.1.4: **single visible header search** + **keyboard command palette** (`⌘K` / `Ctrl+K`).
- Browse pages: “ledger sheet” lists (bordered + clipped + subtle markers), more tactile rails/filters.
- Entry pages: **left rail** at-a-glance + references; senses as “evidence cards” with accent spine; citations remain per-sense.

Plan:
- [x] Tokens: refresh `globals.css` (dot-grid paper + grain overlay; tighter tokens for borders/shadows/easing).
- [x] Typography: introduce Fraunces as display font; keep Instrument Sans + IBM Plex Mono.
- [x] Header/Footer: instrument-panel styling; unify search and command palette affordances.
- [x] Browse: ledger-style lists + updated letter rail.
- [x] Entries: fix entry grid column sizing (rail + main), restyle sense cards + references.
- [x] QA: run gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) + smoke test key flows.
- [x] Release hygiene: bump versions to `0.1.5`, update changelog/docs.
- [ ] Release: tag `v0.1.5`.

## v0.1.4 — Frontend UX overhaul (“Reference Atlas”)

Goal: make the public UI feel fast, obvious, and calm to use — less “componenty”, more “reference work”.

Design direction:
- Keep typography stack: **Instrument Sans + Instrument Serif + IBM Plex Mono**.
- Default theme: **light** (paper/ink), auto dark via `prefers-color-scheme: dark`.
- Enforce a **single visible search box** (global header).
- Add a **keyboard command palette** (`⌘K` / `Ctrl+K`) for navigation + “Search for …” actions (no heavy deps).
- Improve scannability: tighter browse rows, clamped summaries, clearer hierarchy, fewer repeated slugs.
- High‑sense entries (10+): **accordion/collapsible by default** (first sense open; hash opens targeted sense).

Plan:
- [x] Docs: update `SPEC.md` to lock the v0.1.4 UX rules and component conventions.
- [x] Header: redesign `SiteHeader` + search UX; add `CommandPalette` and global hotkeys.
- [x] Browse/search: redesign `/terms`, `/acronyms`, `/tags`, `/sources`, `/search` results layout + density.
- [x] Entry pages: redesign `/term/[slug]` and `/acronym/[slug]` for less repetition, better rail, and high-sense accordion behavior.
- [x] Admin: remove remaining inline styles in key pages (`/admin/entries/[id]`, ingest run, audit, takedown) using shared primitives.
- [x] QA: run gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) + smoke test key flows.
- [x] Release: bump versions to `0.1.4`, update changelog/docs, tag `v0.1.4`.

## v0.1.3 — Frontend design overhaul (“field manual”)

Design direction:
- Default theme: **light “paper + ink” field manual** (with subtle grid/texture).
- Auto dark mode via `prefers-color-scheme: dark`.
- Typography: keep **Instrument Sans + Instrument Serif + IBM Plex Mono**; use mono for metadata, serif for titles.
- Layout motif: **side-rail + footnotes** (references feel like citations, not “cards”).

Plan:
- [x] Tokens: redesign `apps/web/src/app/globals.css` into a real token set (color, type scale, spacing, radii, shadows).
- [x] Motion + a11y: add `prefers-reduced-motion` guardrails and tighten focus styles.
- [x] Primitives: add `apps/web/src/components/ui/*` (Button, Panel/Card, Badge, Chip/Pill, Divider, EmptyState, KeyValue list).
- [x] Refactor shared components: `SiteHeader`, `SiteFooter`, `PageHeader`, `SearchForm`, `Pagination`, `Markdown` → use primitives.
- [x] Navigation: add mobile nav (accessible; minimal JS) and align global nav to SPEC (include About).
- [x] Public page redesign: Home, Browse (Terms/Acronyms/Tags/Sources), Recent/Trending, Search, Sources detail, About/Legal, Changelog.
- [x] Entry pages: add at-a-glance rail; add TOC for senses; footnote-style references per sense.
- [x] Admin facelift: replace inline-styled admin layout + pages with shared primitives + consistent shell.
- [x] QA: run gate (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) + smoke test key flows.
- [x] Docs: update `SPEC.md` (nav + entry IA rules), `README.md`, `apps/web/src/lib/changelog.ts`.
- [x] Release: bump versions to `0.1.3`.
- [x] Release: tag `v0.1.3`.

## v0.1.2 — Tier‑1 source expansion

- [x] Source expansion (Tier‑1): add MITRE ATT&CK Mobile + ICS CTI bundles.
- [x] Source expansion (Tier‑1): add IETF RFC 4949 Internet Security Glossary ingestion.
- [x] Ops: add new source slugs to `SYNAC_STAGING_SOURCE_ALLOWLIST` (prod worker → staging sync).
- [x] Seed: upsert new sources in prod (`pnpm db:seed:content`).
- [x] Ingest: trigger staging runs for new sources, verify promotion + Tier‑1 autopublish.
- [x] Docs: update `SPEC.md` initial sources; update `README.md` + `docs/RELEASING.md`.

## v0.1.1 — Branding polish + source expansion

- [x] Navbar brand lockup: keep `SynAc` wordmark; remove monospace `SYNAC` label.
- [x] Source expansion: add NICCS (CISA) cybersecurity glossary (CSV export) as a new ingest adapter.
- [x] Ops: add `niccs-cisa-glossary` to `SYNAC_STAGING_SOURCE_ALLOWLIST` (prod worker → staging sync).
- [x] Seed: upsert new source in prod (`pnpm db:seed:content`), trigger ingest, verify promotion + Tier‑1 autopublish.
- [x] Docs: update `SPEC.md` “Initial sources” + source registry notes; update `README.md` + `docs/RELEASING.md`.
- [x] Release hygiene: bump versions to `0.1.1`, update changelog, run full gate.

## Post-release hardening — v0.1.0 functional on Railway

- [x] Canonical prod domain confirmed: `synac.app` (no `synac.io` cutover)
- [x] Fix Next prerender + CSP nonce mismatch (force-dynamic for static pages so nonce is present)
- [x] Migrate middleware to App Router `src/proxy.ts` with `clerkMiddleware()`
- [x] Expand CSP allowlist for Clerk domains (`*.clerk.com`, `*.clerk.dev`, `*.clerk.accounts.dev`, custom domain)
- [x] Railway env vars (dev+prod): `NEXT_PUBLIC_SITE_URL`, `SYNAC_ADMIN_EMAILS` (`SYNAC_EDITOR_EMAILS` optional)
- [x] Railway secrets (dev+prod): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [x] Seed roles/users (dev+prod): allowlist bootstrap → DB roles
- [x] Fix manual ingest trigger queue name (`ingest_run`) so Admin → Ingest runs actually execute
- [x] Seed starter public content (dev+prod): sources + tags + initial published entries (`pnpm db:seed:content`)
- [x] Fix Clerk prod custom-domain DNS (Clerk lives under `synac.app`)
    - Prod Clerk custom domains: `clerk.synac.app` + `accounts.synac.app` (DNS verified in Cloudflare).
    - Verified Clerk JS loads on `synac.app` and `/admin` redirects to `accounts.synac.app`.
- [x] Smoke test (Chrome DevTools MCP): prod ✅ (public browse, admin, ingest approve→publish→public page), dev ✅ (public browse/search)

## v0.1.0-dev2 — Staging-first ingest + auto-promote (Tier-1 auto-publish)

- [x] Railway: create `staging` environment (services: `synac`, `worker`, `Postgres-cSfn` for staging DB)
- [x] Worker: add staging→prod promotion job + Tier-1 auto-apply/auto-publish
- [x] Worker: add prod→staging source sync (canonical Source Registry in prod)
- [x] Web: route manual ingest triggers to staging in staging-first mode
- [x] Ops: disable direct upstream ingest in prod (staging-first)
- [x] Runbook: ingest promotion troubleshooting
- [x] Smoke test: staging ingest → prod auto-publish Tier-1 → public browse reflects changes

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
- 2026-01-03: Added `db:seed:content` for starter sources/tags + a minimal published corpus in dev/prod.
- 2026-01-06: Acronym classification: NIST ingest detects acronym-like titles → `entry_type=ACRONYM`, and `/term/*` ↔ `/acronym/*` permanently redirect to canonical route.
- 2026-01-06: Expanded tag taxonomy + added `db:tag:auto` for heuristic auto-tagging from entry text (improves `/tags/*` browse density).
