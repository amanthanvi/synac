# Contributing to SynAc

Thanks for your interest in contributing! This document describes development conventions, workflows, and quality bars to keep the project consistent, accessible, and secure.

## Requirements

- Node.js: 20 or 22 LTS
- Package manager: npm
- Browsers for E2E: Install via Playwright on first run

## Getting started

- Install dependencies:
  - npm ci
- First-time E2E setup (installs browsers/deps):
  - npm run e2e:install
- Common workflows:
  - Development server: npm run dev
  - Typecheck: npm run typecheck
  - Lint: npm run lint
  - Unit tests: npm run test
  - E2E tests: npm run e2e
  - Build: npm run build
  - Preview (served at 4321): npm run preview

## Project principles

- Accessibility first: keyboard navigable, ARIA live regions, 44px tap targets
- Strict security posture:
  - Content Security Policy: no inline scripts or inline styles
  - Astro build configured with inlineStylesheets: 'never'
- Minimal JS by default, progressive enhancement for interactivity
- Privacy preserving: telemetry is opt-in and limited to zero-result queries only
- Deterministic offline behavior via PWA service worker and versioned search index

## Conventional Commits

All commits and PR titles should follow Conventional Commits. Examples:
- feat(search): add filter chips and title highlighting
- fix(search): correct MiniSearch revive
- chore(ci): add Lighthouse budgets run
- docs(readme): document CSP posture
- test(e2e): stabilize offline search

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

## Branches & PRs

- Small, focused PRs that keep CI green
- Include tests for new behavior
- Avoid mixing refactors with feature changes when possible
- Reference the plan or issue in the PR description if relevant

## PR workflow

- Keep changes atomic (prefer docs-only for content updates).
- Use Conventional Commits for PR title and commits (e.g., `docs(content): add content style guide`).
- Apply labels where applicable: `docs`, `content`, `perf`, `ci`, `test`.

## Review checklist — content changes

- Summary length ≤ 240 chars; concise and neutral.
- Sources: at least one authoritative (NIST/RFC/CWE/CAPEC/ATT&CK). Use canonical URLs and set `normative: true` only when applicable.
- Citations render as “Label — URL (Normative|Informative)” per [buildCitation()](src/lib/citation.ts:21).
- Mappings: use `attack.techniqueIds` (e.g., T1059), `cweIds` (e.g., CWE-79), `capecIds` (e.g., CAPEC-63); omit when unknown.
- `updatedAt` is valid ISO 8601 UTC and reflects the edit.
- JSON‑LD at `/terms/{id}.jsonld` returns correct name/url/description/dateModified (see [src/pages/terms/[id].jsonld.ts](src/pages/terms/%5Bid%5D.jsonld.ts:12)).
- CSP posture: no inline scripts or styles, no third‑party embeds without review.
- Performance: homepage JS budget (/) ≤ 50 KB per [lighthouse/budgets.json](lighthouse/budgets.json:1); determinism unchanged.

## Coding standards

- TypeScript strict; no implicit any; no unused
- No inline styles or scripts (strict CSP)
- Prefer CSS utility classes in src/ui/tokens.css and component-scoped styles
- Avoid introducing heavy dependencies without discussion

## Testing

- Unit tests (Vitest):
  - npm run test
- E2E tests (Playwright):
  - npm run e2e (automatically spawns astro dev per playwright.config.ts)
- Offline determinism:
  - tests/e2e/offline-search.spec.ts validates index warm-up + offline search
- Add tests for new behaviors and stabilize with appropriate waits (ARIA live region, hydration, etc.)

## CI gates to keep green

- Typecheck: `npm run typecheck`
- Lint: `npm run lint` (no warnings)
- Unit tests: `npm run test`
- E2E: `npm run e2e` (focused specs allowed for content-only PRs)
- Headers & health:
  - Preview and check headers derive from [security-headers.mjs](security-headers.mjs:1)
  - `curl -I http://localhost:4321/` — strict security headers present
  - `curl -i http://localhost:4321/healthz` — returns 200 and schema
- Lighthouse budgets: `npm run lh:budget` (or `npm run lh:preview`)
- Deterministic build: `npm run build:deterministic` (verifier [scripts/build-determinism.mjs](scripts/build-determinism.mjs:1))
## Lighthouse budgets

We enforce a JavaScript budget on /. Current budget:
- lighthouse/budgets.json: 50 KB for script on path "/"

Run budgets against a running server (e.g. npm run dev or preview):
- npm run lh:budget

Run budgets against a local preview build:
- npm run lh:preview

Note: Budgets should fail the command on exceed. If Lighthouse prompts, we disable error-reporting in scripts to keep CI non-interactive.

## ETL & data refresh

- Commands:
  - `npm run etl:all` (runs MITRE → NIST → merge)
  - `npm run etl:merge`
  - `npm run etl:verify` (ensure merged outputs are consistent)
- Do not commit vendor caches (`data/vendor/**`). Committed outputs are `data/raw/**` and `data/build/merged.json`.
- Scheduled verification may run in CI (when enabled). Keep `etl:verify` passing locally before pushing.

## SEO & canonical domain

- Canonical domain: https://synac.app
- SEO artifacts:
  - public/robots.txt
  - src/pages/sitemap.xml.ts (prerendered)
  - Canonical/OG/Twitter meta in BaseLayout

## Telemetry (opt-in)

- Flag: ENABLE_TELEMETRY in src/lib/constants.ts (default false)
- Endpoint: /api/log-search
- Client sends zero-result events only, shape: { q, ts }
- No PII; do not include IP, UA, or identifiers

## Release notes

- Update CHANGELOG.md with highlights per Conventional Commits
- Version bumps may be automated later; for now, maintainers curate 0.x releases manually


## Handling Dependabot PRs

Dependabot automatically opens PRs for dependency and GitHub Actions updates:

- All dependency PRs are labeled `dependencies` and scoped (`scope: deps` for npm, `scope: ci` for GitHub Actions).
- PR titles follow Conventional Commits (e.g., `chore(deps): bump ...` or `chore(ci): bump ...`).
- CI must be green before merging. Review the PR for breaking changes or major version bumps.
- For npm updates, check the [release notes/changelog](https://github.com/npm/cli/releases) or the dependency's repo for breaking changes.
- For GitHub Actions, review the action's changelog for breaking changes.
- If a PR is safe and CI passes, squash-merge it. If not, close with a comment explaining why.
- After merging, pull the latest main and run `npm ci` locally to update your lockfile and environment.

## Submitting PRs

1) Ensure lint, typecheck, unit, and E2E pass locally
2) Ensure Lighthouse budgets pass (lh:budget or lh:preview)
3) Use a descriptive Conventional Commit style title
4) Keep the PR atomic and add tests
5) Respond to CI and review feedback quickly

## Local preview & checks

- Start preview: `npm run preview` (listens on http://localhost:4321)
- Verify headers: `curl -I http://localhost:4321/` (CSP and related headers from [security-headers.mjs](security-headers.mjs:1))
- Health endpoint:
  - `curl -i http://localhost:4321/healthz` → `200` with JSON
  - `curl -I http://localhost:4321/healthz` → headers only
## License and attribution

- Respect source terms for datasets (e.g., NIST, MITRE)
- Do not introduce code with incompatible licenses
