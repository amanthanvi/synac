# Sources

The registry of cited sources, with license facts on each source page.

## Sub-features

- index: `/sources`, one link per source
- detail: `/sources/rfc4949`, region `Source facts` (base URL, verified date, license, trust)
- cited entries: list on the source page, paged

## How to get to it (user POV)

Header link `Sources`. Open a source name. RFC 4949 is the seeded source.

## Driving it with Playwright

`drive.spec.ts` test `sources list opens RFC 4949`.

Open `/sources`, click the link whose name contains `RFC 4949`, and expect `/sources/rfc4949` plus the region `Source facts`. Screenshot `source-rfc4949.png`.

The read-back for the same source is `GET /api/v1/sources/rfc4949` (covered with the public API sweep).

## Gotchas

- An empty registry says `No sources yet.` Doctor `search-empty` is the signal that sync did not load the corpus. Do not treat that empty state as a content bug until doctor is `READY`.
- An unknown source slug 404s.
- The source title contains punctuation from the registry. Match the link with `/RFC 4949/` rather than a hand-copied glyph.
