# SynAc feature map

Behavior-level inventory of the public glossary and the maintainer CLI. Agents use this map to decide what to drive and what evidence counts. The order below is the regression sweep.

## Baseline preconditions

- Node 24 on `PATH`. Run `pnpm verify:launch` and clear a `NOT_READY` doctor before driving the UI.
- Doctor `READY` means `/api/healthz` is ok, the home page has the glossary search landmark, and `GET /api/v1/search?q=soc` has `meta.total` greater than 0.
- One stack only: web on `127.0.0.1:3000`, Convex on `127.0.0.1:3210`. Launch refuses a second owner of those ports.
- Prefer accessible names (`Search`, `Theme: Dark`, `Term letters`, `Copy link to this sense`). The header `Search` control is a button. The page search field is a textbox with the same accessible name.
- Seeded slugs: term `access-control`, term `domain`, acronym `black`, redirect `2fa`, tag `identity-access`, source `rfc4949`, query `soc`.
- `pnpm gate` is the full checkpoint in `SKILL.md`. Run it once on the final head. Use the named fast group while iterating.

## Proof and skip reporting

The relevant feature file is the coverage set. When a change crosses search, an entry, and the CLI, also read `journeys.md`.

- Exercise every reachable entry point the change can affect, including empty, error, and hostile inputs listed in Gotchas.
- Record the action and the final observable state, including files written and records read back.
- Mocks count only where the product already isolates an upstream fetch. The glossary reads the synced Convex dataset. Do not stub those reads.
- When a path is unreachable, name it and the concrete prerequisite. A live RFC ingest that cannot reach the network is `INCONCLUSIVE`. Any other ingest failure fails the drive. `POST /api/v1/internal/revalidate` is `INCONCLUSIVE` when `SYNAC_REVALIDATE_SECRET` is unset.

## Full sweep

Walk this list top to bottom. Finish with `journeys.md`.

## Home and search

- [home](home.md): Landing page, glossary search, recently updated.
- [search](search.md): Query, type filter, entries versus meanings, empty and ignored queries.
- [command-palette](command-palette.md): Header search button and keyboard palette.

## Browse

- [terms-browse](terms-browse.md): Term index, letters, filter, sort.
- [acronyms-browse](acronyms-browse.md): Acronym index.
- [tags](tags.md): Tag directory and a tag page.
- [sources](sources.md): Source index and a source page.
- [recent](recent.md): Recently updated index.

## Entry

- [entry](entry.md): Term and acronym pages, senses, copy link, citation record.
- [not-found](not-found.md): Unknown slug and the `2fa` redirect.

## Chrome

- [site-chrome](site-chrome.md): Header, footer, mobile menu.
- [theme](theme.md): System, dark, and light, kept in localStorage.
- [about](about.md): About page.
- [legal](legal.md): Privacy policy and terms of use.
- [changelog](changelog.md): Changelog page and RSS feed.

## HTTP API

- [public-api](public-api.md): Public read API under `/api/v1`.

## Maintainer CLI

- [content-check](content-check.md): `pnpm content:check`.
- [content-compile](content-compile.md): `pnpm content:compile` writes `compiled.json`.
- [content-history](content-history.md): `pnpm content:history`.
- [content-sync](content-sync.md): sync into the local Convex deployment.
- [ingest](ingest.md): regenerate one bundle from upstream.

## Journeys

- [journeys](journeys.md): Search to an entry, then a theme that survives navigation.

## Entry contract

Every feature file uses the same four H2s:

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with Playwright` or `Driving it with the CLI`
4. `Gotchas`
