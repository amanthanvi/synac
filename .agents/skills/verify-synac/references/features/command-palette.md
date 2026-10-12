# Command palette

The header search button opens a dialog for navigation and entry lookup.

## Sub-features

- open: button `Search`, or `Control+K` / `Meta+K`, or `/` when focus is outside a text field
- empty: Go to links for terms, acronyms, tags, sources, recent, about, changelog
- query: at least two characters fetches `/api/v1/search` and lists up to eight entries, plus `Search for "..."`
- dismiss: Escape, or the same shortcut again

## How to get to it (user POV)

Click `Search` in the header, or press Ctrl+K (Command+K on macOS). Type, then Enter the highlighted row.

## Driving it with Playwright

`drive.spec.ts` test `command palette opens from the keyboard and navigates`.

Wait until the header button `Search` is visible so the listener is attached. Press `Control+KeyK` until the combobox `Search terms and acronyms` is visible. Fill `soc`. The first option is `Search for "soc"`. Enter lands on `/search` or an entry. Screenshot `palette.png`.

```bash
node apps/e2e/node_modules/@playwright/test/cli.js test \
  --config .agents/skills/verify-synac/playwright.config.mjs \
  .agents/skills/verify-synac/scripts/drive.spec.ts \
  -g "command palette"
```

## Gotchas

- `/` does nothing while a text field is focused. Click the page background first.
- Queries shorter than two characters show navigation matches only. They do not call the API.
- A 429 from the API shows `Search is busy, try again`. An HTTP failure shows `Search is unavailable`. Zero rows show `No results`.
- The shortcut listener attaches after hydration. Press until the combobox appears. A single early keypress can miss.
