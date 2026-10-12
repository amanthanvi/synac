# Terms browse

Alphabetical index of published terms.

## Sub-features

- letters: A through Z and `0-9`, navigation `Term letters`
- filter: textbox `Filter entries`, query parameter `q`, debounced
- sort: combobox `Sort`, `title` (default) or `updated`
- tag chips: navigation `Tag filter`
- paging: 50 rows, page capped at 10

## How to get to it (user POV)

Header link `Terms`, or `/terms`. The heading is `Terms`.

## Driving it with Playwright

`drive.spec.ts` test `terms browse letter, sort, filter, and a rejected letter`.

Open `/terms?letter=d`. The `D` link is current and `/term/domain` is in the list. Choose `Recently updated` in `Sort` and expect `sort=updated` in the URL. Type `access` into `Filter entries` and expect `q=access`. Screenshot `terms-d.png`.

`/terms?letter=DROP%20TABLE` falls back to letter A, which is current.

## Gotchas

- An unknown letter, including a hostile string, is served as `a`. The page stays 200.
- A letter with no rows says `No published terms yet for <letter>`. Assert that sentence when the list is empty. Do not invent rows.
- The filter waits about 260ms before it changes the URL. Wait on the URL, not a fixed sleep alone.
- Page numbers above 10 are clamped. The UI does not offer a page the backend will not serve.
