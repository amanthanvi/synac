# SynAc — Source‑anchored cybersecurity glossary

Fast, content‑first reference built with Astro. Minimal JS by default; add interactivity as needed. Deployed to Cloudflare Pages/Workers via the Cloudflare adapter.

This repository now contains the v0.1.0 foundations: Astro + TS strict + MDX + Cloudflare adapter + strict CSP (no inline) + search with MiniSearch + SEO (robots/sitemap/canonical) + PWA determinism + telemetry (opt‑in, zero‑result only) + lint/format/test/e2e + Lighthouse budgets + CI.

- Canonical domain: https://synac.app

## Stack

- Framework: Astro (TypeScript strict), MDX enabled
- Adapter: @astrojs/cloudflare (SSR/Edge ready)
- PWA: @vite-pwa/astro with generateSW and ignoreURLParametersMatching [/^v$/]
- Search: MiniSearch index delivered from /search.json (versioned), client highlight and filters
- Lint/Format: ESLint, Prettier
- Tests: Vitest (unit), Playwright (E2E including offline determinism)
- Performance: Lighthouse budgets (JS on / limited to 50 KB)
- CI: GitHub Actions (lint, typecheck, unit, build, e2e)

Recommended Node: 20 or 22 LTS to avoid engine warnings with Astro/Vite ecosystem.

## Security & CSP

- Strict CSP posture: no inline scripts or inline styles
- Astro build configured with `inlineStylesheets: 'never'`
- Components refactored to use CSS utility classes instead of inline styles

## SEO & canonical domain

- Canonical base: https://synac.app
- `public/robots.txt` allows crawling and points to sitemap
- `src/pages/sitemap.xml.ts` prerendered (application/xml)
- Canonical + OG/Twitter meta set in BaseLayout

## PWA & offline determinism

- Service worker via @vite-pwa/astro with `registerType: 'autoUpdate'`
- `/search.json` index is versioned with `?v=__BUILD_TIME__` and Workbox ignores that param for caching (`ignoreURLParametersMatching [/^v$/]`)
- Search client warms the index online; offline searches reuse in‑memory index deterministically
- E2E coverage: `tests/e2e/offline-search.spec.ts`

## Telemetry (opt‑in)

- Feature flag: `ENABLE_TELEMETRY` in `src/lib/constants.ts` (default false)
- Endpoint: `src/pages/api/log-search.ts`
- Client only sends zero‑result events when enabled:
  - Shape: `{ q: string, ts: number }`
  - No IP/UA/identifiers; privacy‑preserving by design

## Dev quickstart

- Install deps:
  - `npm ci`
- Development:
  - `npm run dev`
- Typecheck:
  - `npm run typecheck`
- Lint:
  - `npm run lint`
- Unit tests:
  - `npm run test`
- Build:
  - `npm run build`
- Preview (used by E2E or Lighthouse):
  - `npm run preview`
- E2E (first time):
  - `npm run e2e:install`
  - `npm run e2e`
- Lighthouse budgets:
  - Against a running server (e.g., `npm run preview`): `npm run lh:budget`
  - Build + preview + run budgets: `npm run lh:preview`

Default preview base URL for tests and budgets: http://localhost:4321

## Lighthouse budgets

We enforce a JavaScript budget on the home page:
- `lighthouse/budgets.json`: script budget 50 KB for path "/"

Run budgets:
- `npm run lh:budget` (expects server on 4321)
- `npm run lh:preview` (builds, previews, runs Lighthouse, tears down)

Budgets are intended to fail the command if exceeded. Non‑interactive flags are used to avoid prompts.

## Testing

- Unit tests (Vitest):
  - `npm run test`
- E2E tests (Playwright):
  - `npm run e2e` (automatically spawns `astro dev` per `playwright.config.ts`)
- Notable specs:
  - `tests/e2e/home.spec.ts` (home page renders)
  - `tests/e2e/evidence-badges.spec.ts` (evidence badges)
  - `tests/e2e/search-filters.spec.ts` (filter chips + highlighting)
  - `tests/e2e/term-jsonld.spec.ts` (JSON‑LD endpoint + link)
  - `tests/e2e/offline-search.spec.ts` (index warm‑up + offline search)

## Offline determinism &amp; debugging

- Quick validation:
  - `npm run test:offline` (focused offline determinism)
  - `npm run e2e` (full suite; spawns `astro dev` per Playwright config)
- Runtime notes:
  - The service worker is enabled in dev via VitePWA `devOptions.enabled: true` in astro.config.mjs.
  - The client warms the MiniSearch index online and then reuses the in‑memory index offline.
  - Input event directly triggers `onInput()` (no extra microtask/RAF indirection) to avoid flakiness in headless runs.
- Data flow:
  - Index is built at build time via `buildIndexPayload()` and served at `/search.json?v=__BUILD_TIME__`.
  - The client revives the index via `MiniSearch.loadJSON(payload.index, payload.options)`; if unavailable, it falls back to a DOM‑derived mini index.
- Manual check:
  - Launch the site, type `cross` in the search box; results should include “Cross‑Site Scripting (XSS)” sourced from content (`src/content/terms/xss.mdx`).
## Project structure (selected)

```
/
├── public/
│   ├── favicon.svg
│   └── robots.txt
├── lighthouse/
│   └── budgets.json
├── scripts/
│   ├── _http.mjs
│   ├── fetch-nist.mjs
│   ├── fetch-mitre.mjs
│   ├── build-merge.mjs
│   └── lh_preview.sh
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── search.json.ts
│   │   ├── sitemap.xml.ts
│   │   ├── api/
│   │   │   └── log-search.ts
│   │   └── terms/
│   │       ├── [id].astro
│   │       └── [id].jsonld.ts
│   ├── scripts/
│   │   └── searchClient.ts
│   ├── lib/
│   │   ├── constants.ts
│   │   └── searchBuild.ts
│   ├── content/
│   │   ├── config.ts
│   │   ├── schema.ts
│   │   └── terms/*.mdx
│   └── ui/
│       └── tokens.css
├── tests/
│   ├── e2e/*.spec.ts
│   └── unit/*.test.ts
├── astro.config.mjs
├── playwright.config.ts
├── tsconfig.json
├── vitest.config.ts
├── CONTRIBUTING.md
└── CHANGELOG.md
```

## CI

GitHub Actions runs on push and PR to main:
- Install, lint, typecheck, unit tests, build
- Install Playwright browsers
- Run E2E
- Upload Playwright report on failure

Workflow: `.github/workflows/ci.yml`

## Cloudflare deploy (SSR‑ready)

This project uses @astrojs/cloudflare. To deploy on Cloudflare Pages:
- Build command: `npm run build`
- Build output: `dist`
- Enable SSR (Pages Functions) per Astro Cloudflare guide if you add server routes.

## ETL Importers

Scripts to ingest authoritative sources without overwriting authored summaries:

- Fetch NIST CSRC glossary JSON and normalize to fragments:
  - `npm run etl:nist`
  - Output: `data/ingest/nist/*.json`
- Fetch MITRE datasets:
  - ATT&CK STIX / CWE / CAPEC: `npm run etl:mitre` (writes multiple files in `data/ingest/`)
- Merge fragments into per‑id merged files (review‑only):
  - `npm run etl:merge`
  - Output: `data/merged/*.json` (does not modify `src/content`)

Environment overrides
- `NIST_GLOSSARY_URL` or `NIST_GLOSSARY_FILE` (local JSON export)
- `ATTACK_STIX_URL` / `ATTACK_STIX_FILE`, `CWE_JSON_URL` / `CWE_JSON_FILE`, `CAPEC_JSON_URL` / `CAPEC_JSON_FILE`

Security & Licensing
- Static URLs; no dynamic code execution.
- NIST (US Gov PD domestically per 17 USC §105). MITRE datasets (ATT&CK/CWE/CAPEC) free to use with attribution under MITRE Terms of Use.

Review workflow
1) Run fetch scripts to generate ingest artifacts
2) Run merge to produce `data/merged/*.json`
3) Manually integrate into content entries if desired (sources[], mappings), preserving authored summaries/examples.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project conventions, CSP posture, testing, and budgets.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes.
