# Changelog

All notable changes to this project will be documented in this file.

This project adheres to Conventional Commits.

## [0.1.0] - 2025-08-23

### Added
- A11y & mobile polish (PR5):
  - Skip link, semantic landmarks, focusable main.
  - 44px minimum target sizes; utility classes replacing inline styles.
  - ARIA live region for result counts in Search.
- Security & CSP posture (PR6 foundations):
  - Strict CSP posture; no inline scripts/styles.
  - Astro build configured with `inlineStylesheets: 'never'`.
- SEO foundations (PR7):
  - `site: 'https://synac.app'` in `astro.config.mjs` for canonical URLs.
  - `public/robots.txt`.
  - `src/pages/sitemap.xml.ts` prerendered (application/xml).
  - Canonical, OG/Twitter meta in BaseLayout.
- Telemetry plumbing (PR8):
  - Feature flag `ENABLE_TELEMETRY` (default false).
  - `/api/log-search` endpoint emits 204 no-op unless enabled.
  - Client only sends zero-result queries ({ q, ts }) when flag is enabled.
- Search UX (part of PR3/PR5):
  - Versioned `/search.json` with `v=__BUILD_TIME__` cache busting and PWA `ignoreURLParametersMatching [/^v$/]`.
  - Source-kind filter chips and title highlighting.
  - Deterministic offline behavior after index warm-up.
- Testing & budgets (PR9):
  - Playwright E2E: offline-search, search-filters, term JSON-LD, home.
  - Lighthouse budgets with `lighthouse/budgets.json` enforcing JS < 50KB on `/`.
  - Scripts: `npm run lh:budget` (against running server), `npm run lh:preview` (build + preview + budget).

### Changed
- Refactored inline styles across components to CSS utilities for strict CSP.
- Stabilized DOM fallback and hydration waits in client search.

### Notes
- Cloudflare adapter messages about `SESSION` binding are informational unless you enable sessions.
- Telemetry remains opt-in; default off.
