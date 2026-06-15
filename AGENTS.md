# SynAc (monorepo) — Agent Notes

Source of truth: `SPEC.md` (product/spec) + `PLAN.md` (execution tracker).

## Stack

- Web: Next.js App Router + TypeScript (`apps/web`)
- Auth: Clerk (`@clerk/nextjs`)
- DB: Convex (`convex`, `packages/db` facade)
- Worker: Convex cron jobs and scheduled functions (`convex/crons.ts`, `convex/ingest.ts`)
- Styling: CSS Modules (`*.module.css`) + global tokens in `apps/web/src/app/globals.css`
- Package manager: pnpm (see `package.json#packageManager`)

## Workspace layout

- `apps/web/src/app/*`: routes (public + `admin/*` + `api/*`)
- `apps/web/src/components/*`: shared UI/components
- `apps/web/src/components/ui/*`: primitives (Button/Panel/Badge/etc)
- `packages/*`: shared libs

## Guardrails (most common)

- Public UI work: ok. Do **not** edit `apps/web/src/app/admin/*` or `apps/web/src/app/api/*`.
- Do **not** change data model, Convex queries, ingest pipeline, or schema unless asked.
- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
- No CSS frameworks (Tailwind/styled-components/etc). CSS Modules only.

## Golden commands

- Full verification gate: `pnpm gate`
- Web-only tests: `pnpm --filter @synac/web test`

## Design system

- Tokens live in `apps/web/src/app/globals.css` (single source of truth).
- Prefer updating primitives in `apps/web/src/components/ui/*` rather than ad-hoc styles.

## Learned User Preferences

- When CI fails, keep iterating with real fixes until checks pass; do not skip tests or otherwise fake a green pipeline.

## Learned Workspace Facts

- Search index maintenance now lives in Convex (`data:rebuildSearchIndex`).

## Self-Correction Log

- 2026-03-25: For Railway SSH probes, avoid nested shell/backtick quoting; write unique temp scripts under `/app/packages/db` to prevent stray local artifacts and cross-command races.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
