# Implementation Plan

[Overview]
Ship SynAc v0.1.0 to a production-quality MVP by completing ETL pipelines, enriching seed content, tightening search UX (filters/highlights/offline determinism), enforcing strict security/SEO, adding privacy‑safe observability, and finalizing tests with small, atomic PRs.

SynAc already has a solid Astro + TS scaffold with PWA, MiniSearch, content collections, and basic E2E. The plan turns this into a polished, evidence‑first glossary. We will:
- Finalize ETL to ingest NIST + MITRE and write normalized fragments under data/ingest and merged artifacts under data/merged without mutating authored content.
- Enrich seeds to prove value (multiple authoritative sources, mappings, see‑also, often-confused pairs).
- Improve search UX with filter chips and match highlights; ensure deterministic offline behavior via PWA precache and versioned /search.json.
- Enforce strict CSP now (no inline scripts or styles) and refactor inline styles into CSS classes immediately.
- Add SEO (robots, sitemap, canonical, OG/Twitter) and JSON‑LD (DefinedTerm) served via a first‑party JSON endpoint to comply with no‑inline CSP.
- Add opt‑in telemetry for zero‑result queries only (ENV‑guarded, default off).
- Strengthen tests: deterministic offline E2E and Lighthouse performance budgets.

[Types]  
Small, explicit type additions to support new content and telemetry.

- src/content/schema.ts (Zod)
  - Add optional field:
    - oftenConfusedWith: z.array(z.string()).optional()
- src/types/term.ts
  - Mirror schema change:
    - oftenConfusedWith?: string[]
- src/lib/searchBuild.ts
  - Keep SearchDoc as-is; highlight happens client-side.
- Telemetry (shape, docstring only)
  - type ZeroResultEvent = { q: string; ts?: number }
- ETL fragment (documented)
  - NistFragment
    - { id: string; sources: [ { kind: "NIST"; citation: string; url: string; date?: string; excerpt?: string; normative?: true } ]; updatedAt: string }
  - MitreFragments: attack.json, cwe.json, capec.json (normalizations TBD)
  - MergedTermFragment (data/merged/{id}.json)
    - { id: string; sources: [...]; mappings?: {...}; updatedAt: string }

[Files]
Create ETL utilities and endpoints; refactor styles for CSP; add SEO and telemetry endpoints.

- New files
  - scripts/_http.mjs — Robust fetch with timeout, retries, backoff:
    - export async function fetchJsonPinned(url, init = {}, retries = 3, backoffMs = 500)
  - public/_headers — Security headers and cache hints (strict CSP; no inline)
  - public/robots.txt — Robots allow-all with sitemap reference
  - src/pages/sitemap.xml.ts — Build sitemap from content collection (prerendered)
  - src/pages/api/log-search.ts — POST endpoint to log anonymized zero-result searches (prerender = false)
  - src/pages/terms/[id].jsonld.ts — Prerender JSON‑LD (DefinedTerm) per term; served as application/ld+json
  - tests/e2e/search-filters.spec.ts — Verify source-kind filtering and highlighting
  - tests/e2e/lighthouse.spec.ts (or script) — Performance budgets (homepage JS < 50KB)
- Existing files to modify
  - scripts/fetch-nist.mjs — Use _http.mjs; stable write to data/ingest/nist/*.json
  - scripts/fetch-mitre.mjs — Use _http.mjs; write data/ingest/{attack,cwe,capec}.json
  - scripts/build-merge.mjs — Conservative merge into data/merged/*.json; never mutate src/content
  - astro.config.mjs — Add vite.define { __BUILD_TIME__: JSON.stringify(Date.now()) }
  - src/pages/search.json.ts — Include version v: __BUILD_TIME__; deterministic payload for PWA
  - src/components/Search.astro — Add:
    - Filter chips for sourceKinds (toggleable)
    - ARIA live region element for results status (sr-only)
    - Replace inline styles with CSS classes; enforce 44px tap targets
  - src/scripts/searchClient.ts — Add:
    - highlight(text: string, terms: string[])
    - Filter application to MiniSearch results
    - Cache-busting /search.json?v=...
    - Update live region with count
  - src/pages/terms/[id].astro — Add:
    - External JSON‑LD reference: <script type="application/ld+json" src={`/terms/${id}.jsonld`}></script> (no inline script, CSP-compliant)
    - Render oftenConfusedWith section when provided
    - Replace inline styles with CSS classes
  - src/layouts/BaseLayout.astro — Add:
    - <link rel="canonical" href={Astro.url.href} />
    - OG/Twitter meta tags (title, description, url)
    - Add skip link and basic a11y landmarks
  - src/ui/tokens.css — Add utility classes replacing inline styles (spacing, border, grid, card, badge, link, chips, tap-44)
  - src/content/schema.ts — Add oftenConfusedWith field
  - tests/unit/schema.test.ts — Cover new field
  - tests/e2e/evidence-badges.spec.ts — Adjust for class refactor if selectors change
  - README.md — Document ETL, telemetry flag, CSP posture, SEO, and test commands
- Files to delete or move
  - None (refactors remain in place)
- Configuration updates
  - package.json — Optional dev dep for Lighthouse (@lhci/cli or lighthouse) + npm script
- Directories (created by scripts)
  - data/ingest/{nist,attack,cwe,capec}/
  - data/merged/

[Functions]
Add helpers and extend existing functions to support filters/highlights/versioning.

- New
  - scripts/_http.mjs
    - fetchJsonPinned(url, init?, retries?, backoffMs?): Promise<any>
  - src/scripts/searchClient.ts
    - function highlight(text: string, terms: string[]): string
    - function updateCount(n: number): void (updates aria-live region)
- Modified
  - src/pages/search.json.ts
    - GET(): include v: __BUILD_TIME__ in JSON
  - src/scripts/searchClient.ts
    - ensureIndex(): fetch /search.json?v=…; revive MiniSearch or fallback; expose readiness
    - onInput(): apply active source-kind filters; highlight matches
  - scripts/fetch-*.mjs and build-merge.mjs
    - Replace ad-hoc fetch with fetchJsonPinned; write stable JSON artifacts; avoid mutating authored MDX
- Removed
  - None

[Classes]
No new TS/JS classes; CSS class system replaces inline style attributes per strict CSP.

- New CSS classes (src/ui/tokens.css or utilities.css)
  - Layout/util: .container, .section, .grid, .grid--2, .card, .tap-44
  - A11y: .sr-only, focus styles, skip link
  - UI: .badge, .badge--nist|--rfc|--attack|--cwe|--capec|--muted, .link, .btn-chip, .btn-chip--active
- Modified CSS usage
  - Update Search.astro and [id].astro to eliminate inline styles

[Dependencies]
Minimal additions; keep footprint small.

- New Dev Dependencies (optional)
  - lighthouse or @lhci/cli for budget enforcement
- No runtime dependency additions required for MVP
- Vite define for build timestamp (no package required)

[Testing]
Expand coverage to new features and budgets.

- Unit
  - Update schema.test.ts for oftenConfusedWith
  - Add tests for buildIndexPayload stability if needed
- E2E (Playwright)
  - offline-search.spec.ts: warm index online, go offline, assert results and aria-live updates
  - search-filters.spec.ts: toggle source-kind chips and validate filtered results (+ highlight presence)
  - term-jsonld.spec.ts: GET /terms/{id}.jsonld; verify shape and that <script src> is present in page
  - seo.spec.ts: verify robots.txt and sitemap.xml endpoints
  - lighthouse.spec.ts: enforce budgets (JS < 50KB on /)
- Accessibility
  - Verify keyboardability, focus outline, tap targets; live region announcements

[Implementation Order]
Follow atomic PRs to reduce risk and keep CI green.

1) ETL foundations
   - Add scripts/_http.mjs; wire into fetch‑nist.mjs/fetch‑mitre.mjs/build‑merge.mjs; create data/ingest/* and data/merged/*
2) Seed content (evidence‑first)
   - Replace ellipses; add 6–12 new high‑signal entries; fill mappings and seeAlso
3) Search filters/highlight/offline determinism
   - Add filter chips and highlighting; versioned /search.json; ensure PWA precaches payload deterministically
4) Term page UX: differences & JSON‑LD
   - Add external JSON‑LD endpoint; ensure differences callout remains; show updatedAt and source dates
5) A11y & mobile polish
   - Live region, focus management, 44px targets; skip link in layout; complete inline→CSS refactor
6) Security headers & cache hints
   - public/_headers with strict CSP (no inline); cache hints for /search.json and static assets
7) SEO foundations
   - robots.txt, sitemap.xml.ts, OG/Twitter meta, canonical (https://synac.app)
8) Observability (opt‑in)
   - /api/log-search endpoint; ENABLE_TELEMETRY default false; only zero‑result {q, ts}
9) E2E & Lighthouse budgets
   - Deterministic offline E2E and performance budgets
10) Docs & governance
   - README, CHANGELOG v0.1.0, CONTRIBUTING
