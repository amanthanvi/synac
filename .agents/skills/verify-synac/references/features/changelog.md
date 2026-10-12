# Changelog

Versioned notes, plus an RSS feed.

## Sub-features

- page: `/changelog`, heading `Changelog`, one section per version
- rss: link `RSS` to `/changelog/rss.xml`
- empty: `No changelog entries yet.` when the list is empty

## How to get to it (user POV)

Footer link `Changelog`, or the palette row `Changelog`.

## Driving it with Playwright

`drive.spec.ts` test `changelog page and rss feed`.

Open `/changelog`, expect the heading, and expect the `RSS` link href `/changelog/rss.xml`. `GET /changelog/rss.xml` is 200 and the body contains `<rss`. Screenshot `changelog.png`.

## Gotchas

- RSS is XML. A 200 HTML shell is a failure even if the page looks fine.
- An empty changelog is a product state. Assert the empty sentence when the list length is 0.
- Version anchors are on the page. Linking to one is optional unless the change touches anchor ids.
