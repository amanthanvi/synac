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

### Security headers and health

- Headers enforced on all responses:
  - Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'; manifest-src 'self'; upgrade-insecure-requests; block-all-mixed-content — strict non-inline posture aligned to self-hosted assets.
  - Referrer-Policy: strict-origin-when-cross-origin — limit referrer leakage.
  - X-Content-Type-Options: nosniff — prevent MIME sniffing.
  - X-Frame-Options: DENY — prevent clickjacking.
  - Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=() — minimal, deny by default.
  - Cross-Origin-Opener-Policy: same-origin — isolate browsing context.
  - Cross-Origin-Resource-Policy: same-origin — restrict cross-origin resource sharing.
  - Cross-Origin-Embedder-Policy: require-corp — stronger isolation; gate with `SECURITY_COEP=off` if cross-origin embeds are introduced.
  - Origin-Agent-Cluster: ?1 — origin isolation.
  - X-DNS-Prefetch-Control: off — deterministic networking.
  - Strict-Transport-Security: max-age=31536000; includeSubDomains; preload — only sent when `NODE_ENV=production` and the request is HTTPS (detected via `X-Forwarded-Proto=https` on Railway).

- Health endpoint:
  - `GET /healthz` → `200` `application/json` with schema:
    `{ "status": "ok", "uptime": number, "timestamp": "ISO 8601", "version": "string", "commitSha": "string" }`
  - `HEAD /healthz` → `200` with headers only (no body)
  - `Cache-Control: no-store` on `/healthz` responses
  - `COMMIT_SHA` is injected in CI as `${{ github.sha }}` to surface the build commit.

- Shared config: [security-headers.mjs](security-headers.mjs:1) is the single source for CSP and related header directives. CI imports this module to validate directives (e.g., frame-ancestors) so tests and server stay in sync.
- Build info exposure: set `HEALTHZ_EXPOSE_BUILD=off` to redact `version` and `commitSha` fields in `/healthz` responses (defaults to on).
- Startup logs: when `SECURITY_COEP=off`, the server logs a warning at startup indicating Cross‑Origin‑Embedder‑Policy is disabled.
- Proxy trust note: HSTS gating relies on a trusted proxy populating `X-Forwarded-Proto`. Ensure the platform trusts and normalizes proxy headers (Railway does); otherwise clients could spoof headers.
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

Scripts to ingest authoritative sources without overwriting authored summaries. Outputs are deterministic and idempotent.

Commands
- `npm run etl:all` (runs MITRE → NIST → merge)
- `npm run etl:mitre` (ATT&CK, CWE, CAPEC)
- `npm run etl:nist` (NIST CSRC glossary)
- `npm run etl:merge` (build merged catalogs + review files)

Environment
- `ETL_OFFLINE=1` → never attempt network; reuse vendor cache only
- `ETL_FORCE_REFRESH=1` → bypass TTL and refresh vendor artifacts
- `ETL_CACHE_TTL_HOURS=24` → cache freshness window (hours)
- `DEBUG=etl` → verbose logs (HTTP, cache, parsing)
- Optional legacy envs (still supported): `MITRE_ATTACK_URL`, `ATTACK_STIX_URL`, `MITRE_ATTACK_FILE`, `ATTACK_STIX_FILE`

Sources and behavior
- NIST CSRC glossary (ZIP export):
  - Upstream: https://csrc.nist.gov/csrc/media/glossary/glossary-export.zip
  - Behavior: download ZIP, cache to `data/vendor/nist/glossary-export.zip`, unzip in‑memory, locate JSON, normalize
  - Outputs:
    - Normalized raw: `data/raw/nist/glossary.json`, `data/raw/nist/meta.json`
    - Back‑compat: per‑id fragments `data/ingest/nist/*.json`, consolidated `data/nist/glossary.json`
- MITRE datasets:
  - ATT&CK (unchanged normalization; now cached):
    - Primary: GitHub STIX JSON on master; fallback to main
    - Vendor cache: `data/vendor/attack/attack.json` (+ meta)
    - Outputs: `data/ingest/attack.json`, `data/mitre/attack.json`, `data/raw/attack/meta.json` (counts)
  - CWE:
    - Try JSON zip first: https://cwe.mitre.org/data/json/cwec_latest.json.zip
    - On 404: discover latest `cwec_*.xml.zip` on https://cwe.mitre.org/data/downloads.html (highest vX.Y), parse XML → JSON
    - Vendor cache: `data/vendor/cwe/*`
    - Outputs:
      - Normalized raw array: `data/raw/cwe/cwec.json`, meta in `data/raw/cwe/meta.json`
      - Raw XML-as-JSON (when XML fallback used): `data/raw/cwe/_raw.xml.json`
      - Back‑compat map: `data/ingest/cwe.json` → `{ "CWE-79": "Improper ..." }`
  - CAPEC:
    - Try JSON zip first: https://capec.mitre.org/data/json/capec_latest.json.zip
    - On 404: discover latest `capec_*.xml.zip` on https://capec.mitre.org/data/downloads.html
    - Vendor cache: `data/vendor/capec/*`
    - Outputs:
      - Normalized raw array: `data/raw/capec/capec.json`, meta in `data/raw/capec/meta.json`
      - Raw XML-as-JSON (when XML fallback used): `data/raw/capec/_raw.xml.json`
      - Back‑compat map: `data/ingest/capec.json` → `{ "CAPEC-63": "Cross‑Site Scripting" }`

Merge
- `npm run etl:merge`
- Reads normalized raw datasets:
  - `data/raw/nist/glossary.json`
  - `data/raw/cwe/cwec.json`
  - `data/raw/capec/capec.json`
  - `data/ingest/attack.json` (and `data/raw/attack/meta.json` for counts)
- Writes canonical merged output for UI:
  - `data/build/merged.json` with:
    - `meta.sources` summary for nist/cwe/capec/attack (versions, retrievedAt, counts)
    - `data` payloads with deterministic ordering (CWE/CAPEC ascending numeric ID; NIST by slug)
    - CAPEC `relatedWeaknesses` are numeric CWE IDs to facilitate lookups
- Preserves review‑only files:
  - `data/merged/{id}.json` for authored terms (legacy NIST fragment merge), unchanged

Outputs and version control
- `data/vendor/**` — vendor caches (zips/XML/JSON) [excluded from git]
- `data/raw/{nist,cwe,capec}/**` — normalized JSON + `meta.json` [committed]
- `data/build/merged.json` — merged canonical output [committed]
- Back‑compat still produced:
  - `data/ingest/{attack.json,cwe.json,capec.json}`
  - `data/ingest/nist/*.json`, `data/nist/glossary.json`

Troubleshooting
- Offline run: set `ETL_OFFLINE=1`; caches must already exist
- Force refresh: `ETL_FORCE_REFRESH=1` to bypass TTL and re‑download
- JSON endpoints 404 for CWE/CAPEC: automatic XML fallback via downloads pages discovery
- Verbose: set `DEBUG=etl` to log HTTP, cache hits/misses, chosen XML links, and parsing stats
- Offline: set `ETL_OFFLINE=1` and provide local files for each source.

Security & Licensing
- NIST (US Gov PD domestically per 17 USC §105). MITRE ATT&CK (CC BY 4.0), CWE/CAPEC permitted with attribution. Store provenance and cite sources.

Review workflow
1) Run `npm run etl:all` to generate/update ingest artifacts
2) Run `npm run etl:merge` (included in `etl:all`) to produce `data/merged/*.json`
3) Optionally integrate citations/mappings into content entries while preserving authored summaries/examples

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for project conventions, CSP posture, testing, and budgets.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Production (Railway)

Static deployment served from the built `dist/` directory using `sirv` with compression and long‑term caching for hashed assets.

- Build
  - `npm ci && npm run build`

- Start
  - `npm run start` (runs `sirv dist --single --port $PORT --immutable --maxage 31536000 --gzip --brotli`)
  - Procfile uses `web: npm run start`
  - Railway detects the start command automatically

- Health
  - `GET /healthz` returns `200` with body `ok`
  - Configure Railway health probe path to `/healthz`

- Node/runtime
  - Node 22 for local parity: `.nvmrc` is `22`
  - Engines pinned: `"engines": { "node": ">=20.11 <23" }` in package.json

- Local production validation
  ```bash
  npm ci
  npm run build
  PORT=3000 npm run start
  # In another shell:
  curl -i http://localhost:3000/
  curl -i http://localhost:3000/healthz
  # Static asset (adjust path to a real built asset):
  curl -I http://localhost:3000/_astro/*.js
  # Unknown asset → 404
  curl -I http://localhost:3000/unknown-asset.png
  ```

- Notes
  - Static deploys do not expose `/api` routes. The telemetry endpoint remains in the codebase but is disabled by default and inactive in static hosting.
  - CI runs typecheck, lint, build, installs Playwright browsers, and runs the offline determinism spec via `.github/workflows/ci.yml`.
