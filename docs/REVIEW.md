# Baseline Audit (PR0) — SynAc

This document provides an evidence-first baseline of what currently exists in the repository versus claims in [README.md](README.md). No fixes are implemented in PR0; only findings and a task inventory are recorded. File references link directly to sources.

## Verified capabilities

- TypeScript strict configuration: [tsconfig.json](tsconfig.json) extends Astro strict preset; lint relies on TS + Prettier per [eslint.config.js](eslint.config.js).
- CSP posture in build: [astro.config.mjs](astro.config.mjs) sets build.inlineStylesheets 'never' and defines __BUILD_TIME__ for cache-busting. Components use CSS utilities in [src/ui/tokens.css](src/ui/tokens.css); term page avoids inline JSON-LD via external script in [src/pages/terms/[id].astro](src/pages/terms/%5Bid%5D.astro) referencing [src/pages/terms/[id].jsonld.ts](src/pages/terms/%5Bid%5D.jsonld.ts).
- PWA and offline determinism: Service worker via @vite-pwa/astro configured in [astro.config.mjs](astro.config.mjs) with generateSW, registerType autoUpdate, ignoreURLParametersMatching /^v$/. The search index is versioned and fetched with v=__BUILD_TIME__ in [src/scripts/searchClient.ts](src/scripts/searchClient.ts). E2E verifies offline reuse of the warmed in-memory index in [tests/e2e/offline-search.spec.ts](tests/e2e/offline-search.spec.ts).
- Client search with MiniSearch: Index payload built in [src/lib/searchBuild.ts](src/lib/searchBuild.ts) and served at [src/pages/search.json.ts](src/pages/search.json.ts). Client island behavior (warm, revive, DOM fallback, filters, highlight, keyboard shortcuts, zero-result telemetry) in [src/scripts/searchClient.ts](src/scripts/searchClient.ts) and UI in [src/components/Search.astro](src/components/Search.astro).
- Accessibility foundations: Skip link and landmarks in [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro); focus styles and 44px minimum target sizes in [src/ui/tokens.css](src/ui/tokens.css); live region for result counts in [src/components/Search.astro](src/components/Search.astro). E2E verifies count updates and highlighting in [tests/e2e/search-filters.spec.ts](tests/e2e/search-filters.spec.ts).
- SEO and canonical: site is set to https://synac.app in [astro.config.mjs](astro.config.mjs). Canonical and OG/Twitter meta emitted by [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro). Sitemap in [src/pages/sitemap.xml.ts](src/pages/sitemap.xml.ts); robots file at [public/robots.txt](public/robots.txt).
- JSON-LD: External DefinedTerm JSON-LD route implemented in [src/pages/terms/[id].jsonld.ts](src/pages/terms/%5Bid%5D.jsonld.ts) and referenced from the term page via script src in [src/pages/terms/[id].astro](src/pages/terms/%5Bid%5D.astro). E2E validates endpoint and reference in [tests/e2e/term-jsonld.spec.ts](tests/e2e/term-jsonld.spec.ts).
- Performance budgets: Budget file at [lighthouse/budgets.json](lighthouse/budgets.json) caps scripts on “/” to 50 KB; convenience scripts live in [package.json](package.json).
- CI: GitHub Actions workflow [.github/workflows/ci.yml](.github/workflows/ci.yml) runs lint, typecheck, unit (with coverage), build, Playwright E2E. Artifacts uploaded on failure.
- Telemetry (opt-in): Feature flag in [src/lib/constants.ts](src/lib/constants.ts) default false; endpoint at [src/pages/api/log-search.ts](src/pages/api/log-search.ts); client sends only zero-result events when enabled in [src/scripts/searchClient.ts](src/scripts/searchClient.ts).
- Production server (Railway): Static server in [server.mjs](server.mjs) with content type, caching, path traversal protections, health endpoint, SPA fallback limited to HTML-eligible requests; start commands wired via [Procfile](Procfile) and [nixpacks.toml](nixpacks.toml).
- Content schema and examples: Zod schema requires term, summary, sources, mappings, updatedAt in [src/content/schema.ts](src/content/schema.ts); collection registered in [src/content/config.ts](src/content/config.ts); sample entries include [src/content/terms/xss.mdx](src/content/terms/xss.mdx), [src/content/terms/csrf.mdx](src/content/terms/csrf.mdx), [src/content/terms/tls.mdx](src/content/terms/tls.mdx), [src/content/terms/zero-trust.mdx](src/content/terms/zero-trust.mdx).

## Gaps and risks (mapped to pre-identified items)

- prod-headers: No Content-Security-Policy or other security headers are set by the Railway server; see [server.mjs](server.mjs). Strict CSP is claimed but not enforced via headers; Cloudflare-specific [public/_headers](public/_headers) is not present.
- canonical-enforcement: rel=canonical exists in [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro) but there is no 301/308 redirect strategy to canonical domain in [server.mjs](server.mjs). Cloudflare/Pages redirects are not configured here.
- perf-budgets: Budgets exist in [lighthouse/budgets.json](lighthouse/budgets.json) and scripts in [package.json](package.json) but CI does not run Lighthouse; see [.github/workflows/ci.yml](.github/workflows/ci.yml).
- etl-schedule: No scheduled workflow exists to refresh ETL artifacts; [.github/workflows/ci.yml](.github/workflows/ci.yml) does not run `etl:*` tasks.
- terms-coverage: Current authored corpus is small (≈8 entries) under [src/content/terms](src/content/terms); target is 75–150 high-signal, source-anchored entries.
- synonym-alias: Search indexes `aliases` but has no synonym/abbreviation expansion graph; no normalization map observed in [src/lib/searchBuild.ts](src/lib/searchBuild.ts) or [src/scripts/searchClient.ts](src/scripts/searchClient.ts).
- jsonld-coverage: Route generates JSON-LD for all terms, but tests only assert a single exemplar ([tests/e2e/term-jsonld.spec.ts](tests/e2e/term-jsonld.spec.ts)). There is no suite enforcing shape across all slugs.
- contrib-style: Project has principles in [CONTRIBUTING.md](CONTRIBUTING.md) but no contributor style guide for authoring summaries, citations, mappings, seeAlso, oftenConfusedWith.
- 404-offline: No custom 404 or offline UX artifacts noted; [server.mjs](server.mjs) returns plain text for 404; no offline landing guidance for cached search.
- telemetry-scope: Implementation is opt-in and zero-result-only (good) but governance docs should explicitly scope retention/PII and include a disable path per environment.
- licensing-provenance: UI surfaces source kind badges in [src/pages/terms/[id].astro](src/pages/terms/%5Bid%5D.astro) but does not surface upstream license/provenance badges in the Evidence section.
- CSP runtime verification: [src/components/Search.astro](src/components/Search.astro) uses a module script that imports a client file. Astro typically hoists such inline module scripts into external bundles; confirm built HTML contains no inline script to satisfy strict CSP.
- content schema guardrails: [src/content/schema.ts](src/content/schema.ts) does not enforce summary length (≤240 chars) as claimed goal; consider a zod.max for summary.

## Task inventory by PR (scopes, acceptance, validation)

- PR0 — Baseline review (this PR)
  - Scope: Add [docs/REVIEW.md](docs/REVIEW.md). No code or config changes.
  - Acceptance: File added with verified capabilities, gap list, PR plan, and validation snapshot section.
  - Validation notes: None; do not fix failures.

- PR1 — Terms coverage and content governance
  - Scope: Expand corpus to 75–150 terms with complete metadata (summary ≤240 chars, sources with kind/citation/url/type, mappings, updatedAt, seeAlso, oftenConfusedWith). Add contributor content style guide.
  - Acceptance: All terms validate against [src/content/schema.ts](src/content/schema.ts); README “terms coverage” claims updated; style guide section in [CONTRIBUTING.md](CONTRIBUTING.md).
  - Validation: npm run typecheck; npm run test; targeted E2E navigations over several new terms.

- PR2 — ETL scheduling and determinism
  - Scope: Add a scheduled GitHub Actions workflow to run ETL (`etl:all`), persist normalized outputs (data/raw, data/build/merged.json) in PRs or release branches, and document operator guidance.
  - Acceptance: New workflow exists (cron + manual dispatch); ETL artifacts reproducible; README and docs updated.
  - Validation: Manually trigger schedule on a branch; confirm artifacts updated and tests green.

- PR3 — Search synonyms and abbreviation expansion
  - Scope: Introduce curated synonym/alias/abbreviation map and normalize queries/doc fields; ensure highlighting remains accurate; preserve minimal JS budget.
  - Acceptance: Queries like “XSS”, “cross site scripting”, “xss” all unify; unit tests for normalization; E2E verifies synonyms work with filters.
  - Validation: npm run test; npm run e2e.

- PR4 — JSON-LD coverage and schema validation
  - Scope: Validate JSON-LD shape across all terms and enforce via tests; consider schema typing for subjectOf/identifier.
  - Acceptance: E2E or unit iterates getStaticPaths and asserts valid DefinedTerm fields for each slug; CI gate added.
  - Validation: npm run test; npm run e2e.

- PR5 — Accessibility polish and UX safeguards
  - Scope: Confirm aria-live announcements for result count across hydration/fallback modes; keyboard-only flows; color contrast; skip link focus. Add axe checks to CI as non-blocking or thresholded.
  - Acceptance: E2E includes assertions for live region behavior and keyboardability; optional axe scan meets thresholds.
  - Validation: npm run e2e.

- PR6 — Security headers and canonical enforcement
  - Scope: Enforce CSP and related headers. For Railway, set headers in [server.mjs](server.mjs); for Cloudflare, add [public/_headers](public/_headers) with CSP, HSTS, Referrer-Policy, Permissions-Policy, X-Frame-Options. Add canonical redirects to https://synac.app.
  - Acceptance: Built HTML contains no inline JS/CSS; headers present in responses; canonical redirects verified.
  - Validation: curl -I checks per README; targeted E2E for redirects; run security header scanner.

- PR7 — Budgets in CI, 404/offline UX, and provenance
  - Scope: Run Lighthouse budgets in CI; add friendly 404 and offline page guiding cached search; surface source/license provenance badges in Sources.
  - Acceptance: CI fails when JS budget exceeds 50 KB; 404/offline routes covered; UI shows provenance badges.
  - Validation: npm run lh:preview in CI; E2E for 404/offline; visual check of badges.

## Validation snapshot (2025-09-02, local)

- npm run typecheck: PASS — 0 errors, 0 warnings, 8 hints.
  - Notable hints: [src/pages/terms/[id].astro](src/pages/terms/%5Bid%5D.astro:79) script tag treated as is:inline; unused imports in [scripts/fetch-nist.mjs](scripts/fetch-nist.mjs:9) and [scripts/fetch-nist.mjs](scripts/fetch-nist.mjs:10); Cloudflare adapter advisory notes printed during check.
- npm run lint: PASS with warnings — 0 errors, 3 warnings in coverage artifacts:
  - [coverage/block-navigation.js](coverage/block-navigation.js:1), [coverage/prettify.js](coverage/prettify.js:1), [coverage/sorter.js](coverage/sorter.js:1) — Unused eslint-disable directive.
- npm run test: PASS — 4 files, 10 tests.

## Open questions and assumptions

- CSP enforcement in production: confirm whether the primary live domain uses Cloudflare Pages (headers via [public/_headers](public/_headers)) or Railway ([server.mjs](server.mjs)) for security headers.
- Canonical domain strategy: if multiple preview domains exist on Railway, define redirect rules to https://synac.app for production.
- Synonym source: should the alias/synonym map be curated manually or derived from ETL datasets (e.g., CWE aliases)?
- Budget thresholds: is 50 KB script budget on “/” sufficient for future features, or should we reserve headroom (e.g., 40 KB target, 50 KB hard cap)?
- Telemetry governance: confirm retention policy and environments (dev only vs. prod opt-in) and whether to add a no-telemetry build guard.