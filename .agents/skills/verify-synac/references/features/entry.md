# Entry

A published term or acronym: title, senses, copy link, and citation.

## Sub-features

- title: heading level 1 is the entry title (`access control`, `BLACK`)
- senses: anchors `#sense-...`, table-of-contents links
- copy: button `Copy link to this sense`, status `Link copied`
- cite: summary `Cite`, then link `Citation record (JSON)`
- related: region `Related entries` when the entry has relationships

## How to get to it (user POV)

Open a search result, a browse row, or a direct URL such as `/term/access-control` or `/acronym/black`.

## Driving it with Playwright

`drive.spec.ts` test `entry page copy link and citation record`.

Open `/term/access-control`. The heading is `access control`. Click the first `#sense-` link and expect that fragment in the URL. Click `Copy link to this sense` and expect the status `Link copied`. Read the clipboard. It contains `/term/access-control#`. Open `Cite`, follow `Citation record (JSON)`, and expect HTTP 200 whose body names `rfc4949`. Screenshot `entry-access-control.png`.

The acronym path is the end of the acronyms browse test: heading `BLACK`.

## Gotchas

- Clipboard write needs a browser permission and a click. A headless context without `clipboard-read` and `clipboard-write` shows `Could not copy the link`. That failure is the copy path, not a missing button.
- A sense with no definition text says `No definition yet.`
- Citation JSON is a real route, `/api/v1/senses/citation.json`. Fetch the href the page rendered. Do not invent the sense key.
- Multi-sense terms such as `domain` show a numbered list. `access-control` may show a single sense. The copy button is still there.
