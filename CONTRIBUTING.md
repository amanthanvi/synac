# Contributing

SynAc is a public, internet-facing cybersecurity glossary. Contributions are welcome — especially ones that make the project clearer, safer, and easier to use.

## Ways to contribute

Highest-leverage contributions:

- **Docs fixes**: unclear instructions, missing context, broken links.
- **Public web polish**: UI/UX improvements, accessibility fixes, content readability.
- **Editorial YAML (`content/**`)**: sense labels, disambiguation notes, and `confusedWith` pairings, the wording that tells two meanings apart.
- **Content corrections (with sources)**: if an entry is wrong/unclear, open an issue and include citations.
- **Bug reports**: reproducible issues with URLs, screenshots, and steps.

## Contribution boundary (important)

To keep the project safe and reviewable, we intentionally keep the “easy contribution surface” narrow:

- ✅ Welcome: `docs/**`, `README.md`, **public** web UI under `apps/web/src/**`, and the editorial layer in `content/**`
- 🚫 Requires prior maintainer approval: ingest/worker/DB/admin/API changes

Concretely, please don’t open drive-by PRs that modify:

- `packages/db/**`
- `apps/worker/**`
- `apps/web/src/app/admin/**`
- `apps/web/src/app/api/**`

If you have an idea in those areas, open an issue first.

## Editorial contributions (`content/**`)

`content/entries/**/*.yaml` is SynAc's editorial layer: one file per entry,
carrying the sense labels, disambiguation notes, `confusedWith` pairings, tag
assignments, and relationships that SynAc writes itself. It is a normal PR
surface. Fork the repo, edit or add a YAML file, open a PR, and the maintainer reviews
it like any other content change. After merge, the worker's `editorial_sync`
job applies it to production.

What belongs there is your own editorial judgment (how to tell two meanings
apart). What does not is a _definition_. Definitions come from registered
sources with a citation, so propose those as a content-correction issue instead. Never
paste text copied from a source into a note: the editorial layer is licensed
CC BY 4.0 on the premise that SynAc wrote it.

- Schema, semantics, and the full workflow: `docs/content/editorial-layer.md`
- Tag rules (kinds, hierarchy, what the auto-tagger may and may not touch): `docs/content/taxonomy.md`
- Licensing: `docs/content/licensing.md`

## Filing an issue

Use a template. Templates exist so a report arrives with the details needed to
act on it. From the "New issue" page you can pick:

- Bug report, for something broken on the site or in the tooling.
- Feature request, for a change to how SynAc works.
- Content correction, for an entry that is wrong or unclear. Bring citations.
- Source request, to propose a new ingest source with its license or terms URL.
- Term proposal, for a term or acronym SynAc is missing, with a source that
  defines it.
- Sense disambiguation, for an entry whose two meanings are being conflated, or
  a labelled sense whose label does not distinguish it. This is the front door
  to an editorial YAML change. If you already know the wording you want, open
  the PR directly instead.

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
