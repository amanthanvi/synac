# Tags

Curated taxonomy directory and one page per tag.

## Sub-features

- directory: `/tags`, textbox `Filter tags`, client-side filter
- tag page: `/tags/identity-access`, heading `Identity and access`
- type chips: All, Terms, Acronyms on the tag page
- retired tags: a retired slug redirects or explains that the tag is retired

## How to get to it (user POV)

Header link `Tags`. Type in `Filter tags`. Open a tag name.

## Driving it with Playwright

`drive.spec.ts` test `tags filter, empty filter, and a tag page`.

On `/tags`, fill `zzzz-no-such-tag` and expect `No matching tags.` Then fill `identity` and open `Identity and access`. The URL is `/tags/identity-access` and the heading matches the tag name. Screenshot `tag-identity-access.png`.

## Gotchas

- The directory filter is local. It does not change the URL and it does not call the API.
- An unknown tag slug returns 404 with the page-not-found heading. Drive that from `not-found.md` when the change touches routing.
- A tag with zero published entries says `No published entries yet for this tag.`
- Filtering is a substring over name, slug, and description. `identity` matches `Identity and access`.
