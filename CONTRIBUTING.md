# Contributing

SynAc is a public, internet-facing cybersecurity glossary. Contributions are welcome — especially ones that make the project clearer, safer, and easier to use.

## Ways to contribute

Highest-leverage contributions:

- **Content**: propose a term (issue template), request a source, or edit
  `content/overrides/**` directly — summaries, extra tags, aliases, editorial
  senses, corrections. Every entry the site serves comes from `content/`.
- **Docs fixes**: unclear instructions, missing context, broken links.
- **Public web polish**: UI/UX improvements, accessibility fixes, content readability.
- **Bug reports**: reproducible issues with URLs, screenshots, and steps.

## Contributing content

All glossary content lives in `content/` — see `content/README.md` for the
layout. The short version:

- `content/overrides/term/<slug>.json` and `content/overrides/acronym/<slug>.json`
  are the human-editable layer: sparse files that adjust summaries, tags,
  aliases, and relationships, add editorial senses, or suppress an entry
  (the takedown mechanism).
- `content/generated/**` is machine-owned — the ingest workflow regenerates it;
  don't hand-edit those files.
- `content/sources/*.json` and `content/tags.json` are curated registries;
  new sources need complete license terms (see `docs/content/licensing.md`).
- Validate locally with `pnpm content:check`; CI runs the same check on every PR.
- When a content PR merges to `main`, the deploy workflow syncs it into the
  live site. Git history is the audit trail.

## Contribution boundary

Open surface, no prior approval needed:

- `content/overrides/**`
- `docs/**` and `README.md`
- the public web UI under `apps/web/src/**`, except the paths listed below

Protected paths, enforced by `.github/CODEOWNERS`:

- `content/sources/`, `content/generated/`, `content/tags.json`,
  `content/tag-assignments.json`, `content/redirects.json`
- `convex/`, `tools/`, `.github/workflows/`
- `apps/web/src/app/api/`, `apps/web/src/proxy.ts`
- build and dependency configuration: `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `eslint.config.mjs`, `tsconfig.base.json`,
  `**/vitest.config.ts`, `vercel.json`

If you have an idea in a protected path, open an issue first. See
`GOVERNANCE.md`.

## Getting set up

Start here: `docs/contributing/local-dev.md`.

## PR workflow

- Keep diffs small/medium and focused.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, ...).
- Run the local verification gate before opening a PR: `pnpm gate`.
- For UI changes, include before and after screenshots, desktop and mobile
  where it matters, and run the end-to-end suite:
  `pnpm --filter @synac/e2e test:e2e` against a local stack. See
  `docs/contributing/local-dev.md`.
- If behavior changes, update the docs that describe it: `README.md`,
  `docs/**`, and `content/README.md`. `SPEC.md` and `PLAN.md` are historical
  records; do not update them for new work.

## Code style (public web)

- TypeScript: no suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
  ESLint enforces this, and the shared compiler options turn on
  `noUncheckedIndexedAccess`, so narrow index access before you use it.
- Styling: CSS Modules (`*.module.css`) + tokens in `apps/web/src/app/globals.css`.
- No CSS frameworks (Tailwind/styled-components/etc).
- Prefer editing shared primitives under `apps/web/src/components/ui/**` over one-off styling.

## Reporting security issues

Please do **not** file public issues for security reports. Follow `SECURITY.md`.

## How decisions are made

See `GOVERNANCE.md`.

## Code of Conduct

This project follows `CODE_OF_CONDUCT.md`.

