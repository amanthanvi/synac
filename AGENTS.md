# SynAc (monorepo) — Agent Notes

Source of truth: `docs/architecture/overview.md` (architecture) + `SPEC.md` (product background).

## Stack

- Web: Next.js App Router + TypeScript (`apps/web`), server-first, no client Convex hooks
- Backend: Convex (`convex/`) — read-only public queries + service-key-guarded runtime mutations
- Content: `content/` is the source of truth; compiled + synced by `tools/content`
- Ingest: `tools/ingest` adapters run in GitHub Actions and open PRs
- Styling: CSS Modules (`*.module.css`) + global tokens in `apps/web/src/app/globals.css`
- Package manager: pnpm (see `package.json#packageManager`)

## Workspace layout

- `apps/web/src/app/*`: public routes + `api/v1/*`
- `apps/web/src/components/*`: shared UI (`components/ui/*` primitives)
- `convex/*`: schema, public queries, sync mutations, runtime mutations
- `content/*`: sources, tags, generated bundles, overrides (see `content/README.md`)
- `tools/content`, `tools/ingest`: content pipeline + ingest adapters
- `tests/convex`: convex-test suite

## Guardrails (most common)

- Never hand-edit `content/generated/**` — regenerate via `pnpm ingest` or curate via `content/overrides/**`.
- Convex code follows `convex/_generated/ai/guidelines.md`: validators on every function, indexed queries only (no `.filter()`), bounded reads, `internal*` for private functions.
- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`, `as never`).
- No CSS frameworks (Tailwind/styled-components/etc). CSS Modules only.
- There is no auth surface; do not add accounts, sessions, or admin routes.

## Golden commands

- Full verification gate: `pnpm gate`
- Content validation: `pnpm content:check`
- Convex tests: `pnpm test:convex`
- Local backend: `CONVEX_AGENT_MODE=anonymous npx convex dev`, then `pnpm --filter @synac/content-tools sync`
- Regenerate a bundle: `pnpm ingest -- --source rfc4949`

## Design system

- Tokens live in `apps/web/src/app/globals.css` (single source of truth).
- Prefer updating primitives in `apps/web/src/components/ui/*` rather than ad-hoc styles.

## Learned User Preferences

- When CI fails, keep iterating with real fixes until checks pass; do not skip tests or otherwise fake a green pipeline.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
