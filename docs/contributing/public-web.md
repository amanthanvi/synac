# Contributing: public web UI

SynAc’s public site lives in `apps/web` (Next.js App Router).

This repo is intentionally conservative about what areas are “easy to contribute to”. Most contributions should stay within the public web surface.

## Safe areas to change

- Public routes (do not touch admin/API):
  - `apps/web/src/app/**` excluding:
    - `apps/web/src/app/admin/**`
    - `apps/web/src/app/api/**`
- Shared components:
  - `apps/web/src/components/**`
- UI primitives (preferred for shared styling):
  - `apps/web/src/components/ui/**`
- Design tokens:
  - `apps/web/src/app/globals.css`
- Public assets:
  - `apps/web/public/**`

## Styling rules

- CSS Modules only (`*.module.css`).
- No Tailwind/styled-components/etc.
- Prefer updating existing primitives over inventing new one-off patterns.

## TypeScript rules

- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
- Keep changes small and readable; avoid large refactors unless coordinated in an issue first.

## UX expectations

For UI PRs, include:

- Desktop screenshot
- Mobile screenshot
- Any accessibility notes (keyboard, focus, color contrast)

## Run locally

Follow `docs/contributing/local-dev.md`.

