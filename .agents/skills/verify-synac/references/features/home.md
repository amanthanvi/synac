# Home

The landing page: a glossary search box and a short list of recently updated entries.

## Sub-features

- hero-search: text box that submits to `/search`
- recent: up to eight recently updated entries, plus a link to the full list
- quick-links: terms, acronyms, and tags

## How to get to it (user POV)

Open `/`. The heading is `SynAc`. The search field is the large text box. Recently updated sits under it.

## Driving it with Playwright

```bash
pnpm verify:smoke
```

Or the home test inside `pnpm verify:drive`.

Fill the textbox named `Search` with `soc` and press Enter. The URL becomes `/search?q=soc` and at least one result link is visible. The region named `Recently updated` contains entry links when the dataset is synced.

Screenshot `smoke-home.png` shows the filled path's start. `home.png` is the drive shot.

## Gotchas

- The header control named `Search` is a button that opens the palette. The home field is a textbox with the same accessible name.
- An empty dataset renders `No published entries yet.` inside Recently updated. Doctor reports `empty-dataset` or `search-empty` before you treat that as the normal home.
- A one-character query and the stopwords `a`, `an`, `and`, `or`, `the` do not run a search. Drive those on the search page.
- A query longer than 120 characters is truncated. The form still submits.
