# Contributing

SynAc is a public, internet-facing cybersecurity glossary. Contributions are welcome — especially ones that make the project clearer, safer, and easier to use.

## Ways to contribute

Highest-leverage contributions:

- **Docs fixes**: unclear instructions, missing context, broken links.
- **Public web polish**: UI/UX improvements, accessibility fixes, content readability.
- **Content corrections (with sources)**: if an entry is wrong/unclear, open an issue and include citations.
- **Bug reports**: reproducible issues with URLs, screenshots, and steps.

## Contribution boundary (important)

To keep the project safe and reviewable, we intentionally keep the “easy contribution surface” narrow:

- ✅ Welcome: `docs/**`, `README.md`, and **public** web UI under `apps/web/src/**`
- 🚫 Requires prior maintainer approval: ingest/worker/DB/admin/API changes

Concretely, please don’t open drive-by PRs that modify:

- `packages/db/**`
- `apps/worker/**`
- `apps/web/src/app/admin/**`
- `apps/web/src/app/api/**`

If you have an idea in those areas, open an issue first.

## Getting set up

Start here: `docs/contributing/local-dev.md`.

## PR workflow

- Keep diffs small/medium and focused.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, ...).
- Run the local verification gate before opening a PR: `pnpm gate`.
- For UI changes: include before/after screenshots (desktop + mobile when relevant).
- If behavior changes, update docs (`README.md`, `SPEC.md`, `PLAN.md`, `docs/**`) as needed.

## Code style (public web)

- TypeScript: no suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
- Styling: CSS Modules (`*.module.css`) + tokens in `apps/web/src/app/globals.css`.
- No CSS frameworks (Tailwind/styled-components/etc).
- Prefer editing shared primitives under `apps/web/src/components/ui/**` over one-off styling.

## Reporting security issues

Please do **not** file public issues for security reports. Follow `SECURITY.md`.

## How decisions are made

See `GOVERNANCE.md`.

## Code of Conduct

This project follows `CODE_OF_CONDUCT.md`.

