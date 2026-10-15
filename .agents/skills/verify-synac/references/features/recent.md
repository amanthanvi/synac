# Recent

Published entries ordered by most recent update.

## Sub-features

- list: `/recent`, 50 rows
- paging: `page`, hard cap 4

## How to get to it (user POV)

Home link `View all` under Recently updated, or the palette row `Recent updates`, or `/recent`. The heading is `Recently updated`.

## Driving it with Playwright

`drive.spec.ts` test `recent page paginates inside the cap`.

`/recent` shows pagination text `Page 1`. `/recent?page=99` redirects to `/recent?page=4`. Screenshot `recent.png`.

## Gotchas

- Page numbers above 4 redirect to page 4. They do not 404.
- A non-numeric `page` is treated as page 1.
- The home block shows eight rows. The recent page shows the longer list. Both read the same recent query.
