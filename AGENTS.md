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
- `packages/*`: shared libs

## Guardrails (most common)

- Public UI work: ok. Do **not** edit `apps/web/src/app/admin/*` or `apps/web/src/app/api/*`.
- Do **not** change data model, Prisma, queries, ingest pipeline, or DB schema.
- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
- No CSS frameworks (Tailwind/styled-components/etc). CSS Modules only.

## Golden commands

- Full verification gate: `pnpm gate`
- Web-only tests: `pnpm --filter @synac/web test`

## Design system

- Tokens live in `apps/web/src/app/globals.css` (single source of truth).
- Prefer updating primitives in `apps/web/src/components/ui/*` rather than ad-hoc styles.
