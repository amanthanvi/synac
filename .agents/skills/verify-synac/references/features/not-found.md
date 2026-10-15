# Not found and redirects

Unknown URLs and the permanent redirect from a term URL to an acronym URL.

## Sub-features

- missing-page: heading `Page not found`
- term-to-acronym: `/term/2fa` responds 308 to `/acronym/2fa`
- missing-tag: `/tags/nonexistent` is the same not-found page

## How to get to it (user POV)

Follow a stale link, or type a slug that is not published.

## Driving it with Playwright

`drive.spec.ts` test `missing entry and acronym redirect`.

`/term/this-slug-does-not-exist-9f3a` shows `Page not found`. Screenshot `not-found.png`.

`/term/2fa` lands on `/acronym/2fa` with a level-1 heading. Playwright follows the redirect. A status check belongs on `request.get` with `maxRedirects: 0`, which returns 308 and a `location` containing `/acronym/2fa`.

## Gotchas

- The not-found copy mentions the palette shortcut. The page still offers home, terms, and acronyms links.
- A hostile slug with spaces or slashes is a different route, not this page. Use a single unknown path segment.
- The redirect is only for slugs that exist as the other entry type. An unknown slug stays 404.
