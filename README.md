# SynAc — Source‑anchored cybersecurity glossary (PR0 scaffold)

Fast, content‑first reference built with Astro. Minimal JS by default; add interactivity as needed. Deployed to Cloudflare Pages/Workers via the Cloudflare adapter.

This repository currently contains the PR0 scaffold: Astro + TS strict + MDX + Cloudflare adapter + lint/format/test/e2e + CI + minimal design tokens and layout.

## Stack

- Framework: Astro (TypeScript strict), MDX enabled
- Adapter: @astrojs/cloudflare (SSR/Edge ready)
- Lint/Format: ESLint, Prettier
- Tests: Vitest (unit), Playwright (E2E)
- CI: GitHub Actions (lint, typecheck, unit, build, e2e)

Recommended Node: 20 or 22 LTS to avoid engine warnings with Astro/Vite ecosystem.

## Dev quickstart

- Install deps:
  - npm ci
- Development:
  - npm run dev
- Typecheck:
  - npm run typecheck
- Lint:
  - npm run lint
- Unit tests:
  - npm run test
- Build:
  - npm run build
- Preview (used by E2E):
  - npm run preview
- E2E (first time):
  - npm run e2e:install
  - npm run e2e

Default preview base URL for tests: http://localhost:4321

## Project structure

```
/
├── public/
│   └── favicon.svg
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   └── index.astro
│   └── ui/
│       └── tokens.css
├── tests/
│   ├── e2e/
│   │   └── home.spec.ts
│   └── unit/
│       └── smoke.test.ts
├── astro.config.mjs
├── playwright.config.ts
├── tsconfig.json
├── vitest.config.ts
└── .github/workflows/ci.yml
```

## CI

GitHub Actions runs on push and PR to main:
- Install, lint, typecheck, unit tests, build
- Install Playwright browsers
- Run E2E
- Upload Playwright report on failure

Workflow: .github/workflows/ci.yml

## Cloudflare deploy (SSR‑ready)

This project uses @astrojs/cloudflare. To deploy on Cloudflare Pages:
- Build command: npm run build
- Build output: dist
- Enable SSR (Pages Functions) per Astro Cloudflare guide if you add server routes.

## Notes

- Keep changes incremental and adhere to Conventional Commits.
- TypeScript strict is enabled; keep the code clean (no implicit any, no unused).
- Keep dependencies minimal.
