# Public API

Unauthenticated read API. The pages and the API read the same synced generation.

## Sub-features

- health: `GET /api/healthz` (doctor uses this)
- search: `GET /api/v1/search`
- entry: `GET /api/v1/entries/by-slug`
- lists: `GET /api/v1/terms`, `/api/v1/acronyms`, `/api/v1/sources`, `/api/v1/sources/rfc4949`
- tags: `GET /api/v1/tags` is advertised by `listTags` in `apps/web/src/lib/openapi.ts` and in `docs/api.md`. There is no `apps/web/src/app/api/v1/tags/route.ts`, so the route is 404. The drive does not request it.
- citation: `GET /api/v1/senses/citation.json`
- export: `GET /api/v1/export/entries.json`
- document: `GET /api/v1/openapi.json`
- operator: `POST /api/v1/internal/revalidate` (secret required)
- reports: `POST /api/v1/csp-report`

## How to get to it (user POV)

Readers do not see a separate API screen. The search page, the palette, and the citation link on an entry call these routes. `docs/api.md` lists them for programmatic readers.

## Driving it with Playwright

`drive.spec.ts` test `public api search, etag, openapi, and export`, plus the citation fetch in the entry test.

- `GET /api/v1/search?q=soc` is 200, `meta.total` greater than 0, and `results` is an array.
- The same URL with `If-None-Match` set to the first response's `etag` returns 304 and an empty body.
- `GET /api/v1/search?q=the` is 200 and `meta.total` is 0.
- `GET /api/v1/openapi.json` is 200 and `openapi` starts with `3.`.
- `GET /api/v1/entries/by-slug?type=TERM&slug=access-control` is 200 and `entry.slug` is `access-control`.
- The same route with slug `this-slug-does-not-exist-9f3a` is 404.
- `GET /api/v1/export/entries.json?page=1` is 200 and `results` is non-empty.

## Gotchas

- A refused query (empty, one character, stopword) is 200 with an empty `results` array. It is not a 400.
- `GET /api/v1/tags` stays 404 until a route exists. Do not assert 200 from the OpenAPI entry or from `docs/api.md`. The drive does not call it.
- Search is limited to 60 calls a minute per caller. A sweep that loops will start returning 429. Stay on the calls listed above.
- `POST /api/v1/internal/revalidate` stays dark unless `SYNAC_REVALIDATE_SECRET` is set and at least 16 characters. That path is `INCONCLUSIVE` without the secret. Do not send a guessed bearer token.
- Export page 1 returns real rows on `results`. Count that array. Do not download the whole corpus in a smoke run.
