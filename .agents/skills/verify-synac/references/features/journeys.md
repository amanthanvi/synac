# Journeys

Paths that cross more than one feature. Walk this file at the end of a broad sweep.

## Sub-features

- search-to-entry: home search `access control` opens `/term/access-control`
- theme-survives-navigation: dark theme set on the entry is still dark on `/`

## How to get to it (user POV)

Start at the home search box. Open `access control`. Change the theme. Go back home.

## Driving it with Playwright

`drive.spec.ts` test `journey from search to a saved theme`.

Fill the home textbox `Search` with `access control` and press Enter. The URL is `/search` with that query. Open the link `/term/access-control`. The heading is `access control`. Click the theme button once. Visit `/`. `<html data-theme="dark">` is set and `localStorage['synac-theme']` is `dark`. Screenshot `journey-home-dark.png`.

The CLI half of a cross-surface change is still `pnpm verify:drive`: compile writes `compiled.json`, and launch's sync log plus this page are the read-back of those records.

## Gotchas

- The search form encodes the space as `+` or `%20`. Accept either in the URL.
- Theme state is per browser context. This journey sets it inside one test.
- If `access control` is missing from search while doctor is `READY`, the corpus changed. Update the seeded slug in this file and in `drive.spec.ts` together, after you confirm the new slug in `content/`.
