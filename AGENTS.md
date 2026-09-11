# SynAc (monorepo) — Agent Notes

Source of truth: `SPEC.md` (product/spec) + `PLAN.md` (execution tracker).

## Stack

- Web: Next.js App Router + TypeScript (`apps/web`)
- Auth: Clerk (`@clerk/nextjs`)
- DB: Postgres + Prisma (`packages/db`) — do not change unless asked
- Worker: pg-boss (`apps/worker`) — do not change unless asked
- Styling: CSS Modules (`*.module.css`) + global tokens in `apps/web/src/app/globals.css`
- Package manager: pnpm (see `package.json#packageManager`)

## Workspace layout

- `apps/web/src/app/*`: routes (public + `admin/*` + `api/*`)
- `apps/web/src/components/*`: shared UI/components
- `apps/web/src/components/ui/*`: primitives (Button/Panel/Badge/etc)
- `apps/e2e`: Playwright + axe end-to-end suite (`tests/*.spec.ts`)
- `packages/*`: shared libs
- `content/entries/**/*.yaml`: editorial layer (sense labels, disambiguation
  notes, confusions, tag assignments) applied by the worker's `editorial_sync`
  job. See `docs/content/editorial-layer.md`.

## Guardrails (most common)

- Public UI work: ok. Do **not** edit `apps/web/src/app/admin/*` or `apps/web/src/app/api/*`.
- Do **not** change data model, Prisma, queries, ingest pipeline, or DB schema.
- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`). This is
  lint-enforced: `@typescript-eslint/ban-ts-comment` and `no-explicit-any` are
  errors in `eslint.config.mjs`.
- Public pages load data through `@synac/db` query loaders; never call
  `getPrismaClient` from a page.
- No CSS frameworks (Tailwind/styled-components/etc). CSS Modules only.

## Golden commands

- Full verification gate: `pnpm gate`
  (`format` → `lint` → `typecheck` → `test` → `build`)
- Web-only tests: `pnpm --filter @synac/web test`
- Coverage: `pnpm test:coverage`
- Strict lint (no warnings): `pnpm lint:strict`
- Version consistency: `pnpm version:check`
- Migration drift: `pnpm db:migrate:drift` (needs an EMPTY
  `SHADOW_DATABASE_URL`)
- End-to-end: build + seed + `pnpm --filter @synac/web start`, then
  `pnpm test:e2e`
- Local Postgres with every database and extension: `docker compose up db`

## Design system

- Tokens live in `apps/web/src/app/globals.css` (single source of truth).
- Prefer updating primitives in `apps/web/src/components/ui/*` rather than ad-hoc styles.

## Learned User Preferences

- When CI fails, keep iterating with real fixes until checks pass; do not skip tests or otherwise fake a green pipeline.

## Learned Workspace Facts

- Search index maintenance for `@synac/db` uses `pnpm --filter @synac/db db:search:index:check` and `db:search:index:rebuild` (not `db:search:rebuild`).
- `packages/db` integration-style helpers can truncate or wipe schema data; point local Vitest/integration `DATABASE_URL` at a dedicated test database, not shared dev or production URLs.
- Four local databases are expected: `synac` (dev), `synac_test`,
  `synac_staging_test`, and an EMPTY `synac_shadow` for migration drift checks.
- `tsconfig.json` at the repo root is tooling-only: it exists so type-aware
  ESLint can resolve `apps/worker`, `packages/db` and `packages/shared`, which
  ship only a `tsconfig.build.json`. Nothing builds from it.

## Self-Correction Log

- 2026-03-25: For Railway SSH probes, avoid nested shell/backtick quoting; write unique temp scripts under `/app/packages/db` to prevent stray local artifacts and cross-command races.
