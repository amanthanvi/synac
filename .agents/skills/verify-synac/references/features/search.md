# Search

Full-text search over published entries and meanings.

## Sub-features

- query: GET form, parameter `q`
- type-filter: All, Terms, Acronyms (`type=TERM` or `type=ACRONYM`)
- scope: Entries or Meanings (`scope=senses`)
- paging: `page`, capped at 10, page size 20

## How to get to it (user POV)

Submit the home search box, or open `/search`. The heading is `Search`. With a real query, filters sit above the results.

## Driving it with Playwright

`drive.spec.ts` test `search empty, ignored, filtered, and hostile queries`.

- `/search` shows `Search published entries`.
- `/search?q=the` shows `Try a more specific query`.
- `/search?q=soc&type=TERM&scope=senses` keeps Meanings as the current filter and lists result links.
- `/search?q=<script>alert(1)</script>` still renders the Search heading. The query stays text in the box.

Screenshot `search-empty.png` and `search-soc.png`.

The matching read is `GET /api/v1/search?q=soc` with `meta.total` greater than 0. That is the same query the page runs.

## Gotchas

- Empty, one character, and the bare stopwords never call the search index. They are guidance, not "no matches".
- After 60 searches in a minute from one caller, the page says `Too many searches` and the API returns 429. Do not flood the bucket during a sweep. A later drive in the same minute can look empty because the limiter refused.
- `page=0`, `page=-1`, and `page=999` clamp into 1 through 10. There is no error page for a wild page number.
- Unknown `type` and `scope` values fall back to all entries. They do not 400.
