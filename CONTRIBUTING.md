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

## Contribution boundary (important)

To keep the project safe and reviewable:

- ✅ Welcome: `content/overrides/**`, `content/tags.json`, `docs/**`,
  `README.md`, and **public** web UI under `apps/web/src/**`
- 🚫 Requires prior maintainer review (enforced via CODEOWNERS):
  `content/sources/**`, `content/generated/**`, `convex/**`, `tools/**`,
  and `.github/workflows/**`

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

