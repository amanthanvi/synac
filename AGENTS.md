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
- `convex/` and `tests/convex/` are linted by `pnpm lint:convex` and typechecked by `pnpm typecheck:convex`. New Convex code must pass both.
- `tsconfig.base.json` enables `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`. Narrow an index access before you use it; do not reach for a suppression.

## Golden commands

- Full verification gate: `pnpm gate`. It runs, in order: `lint`, `lint:convex`, `format`, `typecheck`, `typecheck:convex`, `test`, `tagging:check`, `content:check`, `content:history`, `build`.
- End-to-end suite: `pnpm --filter @synac/e2e test:e2e`. It needs a running local stack and is not part of `pnpm gate`.
- Content validation: `pnpm content:check`
- Convex tests: `pnpm test:convex`
- Local backend: `CONVEX_AGENT_MODE=anonymous npx convex dev`, then `pnpm --filter @synac/content-tools sync`
- Regenerate a bundle: `pnpm ingest -- --source rfc4949`

## Verification

Drive the local stack from the repo root with `pnpm verify:launch`, `pnpm verify:doctor`, `pnpm verify:smoke`, `pnpm verify:drive`, and `pnpm verify:cleanup`. From a package directory, use the workspace form (`pnpm -w verify:doctor`, and the same `-w` prefix for the other verify scripts). The scripts `chdir` to the repo root themselves. The procedure and the fast test groups live in `.agents/skills/verify-synac/SKILL.md`. Feature work includes a Proof section: commands, evidence paths that survive cleanup, results, and `INCONCLUSIVE` when a step could not run. While iterating, run the named fast group for the package you touched. Run `pnpm gate` once on the final head.

`pnpm verify:launch` snapshots the hash, contents, mode, staged state, and repo root of `AGENTS.md`, `CLAUDE.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `convex.json`, `skills-lock.json`, Convex skill files, `convex/_generated/ai/`, `.cursor/rules/convex_rules.mdc`, and `apps/web/next-env.d.ts`. State for each checkout lives in `/tmp/synac-verify-<hash>`, where `<hash>` is the first 12 hex characters of sha256 of that repo root. Launch and cleanup use tmux sessions `synac-v-<hash>-convex` and `synac-v-<hash>-web`, and they signal only the pids recorded in that directory. Cleanup from a second worktree does not stop the first checkout. A `run.json` with no repo root is backed up and its pids are not signaled. If launch is killed before it finishes, the next launch restores tool-owned files from that snapshot before it takes a new one. Each tool claim is written to `writes.json` as soon as it is recorded. Launch refuses when the snapshot names a different checkout, has no checkout identity, or cannot be read, and tells you to remove that checkout's snapshot directory or move it aside. Cleanup still stops processes recorded for this checkout, backs that manifest up, and skips the file restore. Launch prints `REUSED` only when doctor is `READY`, this checkout's recorded web session is alive, the port 3000 listener matches the pid in `run.json`, port 3211 is closed or its listener matches the recorded Convex site pid, and the recorded `git rev-parse HEAD` plus the checkout hash are unchanged. That hash covers `git diff HEAD`, `git status --porcelain=v1 -uall`, and the contents of untracked files that are not ignored. That path does not restore. Any other listener on port 3000 is left alone. A write is recorded only from the hash taken immediately after the Convex or Next step that owns that path. Cleanup and a later launch restore those tool-owned files, including `.cursor/rules/convex_rules.mdc` and Convex skill files, to that snapshot only when the bytes still match what the run wrote. `AGENTS.md`, `CLAUDE.md`, `apps/web/CLAUDE.md`, and `convex.json` are left in place and warned. They back the current path up under `/tmp/synac-verify-<hash>/restored/<run-id>/` first, including when the path is a symlink, and never change the git index. Any other change is left in place and printed as a warning.

## Cloud Agent notes

- Node must be `24` (see `.node-version`). If the base image ships an older `node` ahead of nvm on `PATH` (e.g. `/exec-daemon/node`), put the nvm Node 24 bin directory first: `export PATH="$NVM_DIR/versions/node/$(nvm version 24)/bin:$PATH"`.
- After the anonymous Convex backend is ready, set `npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev` before `pnpm --filter @synac/content-tools sync`. Web env placeholders: `SYNAC_CONVEX_SERVICE_KEY=local-dev`, `SYNAC_RATE_LIMIT_SALT=local-dev`, `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`.

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
