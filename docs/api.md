# Public read API

SynAc serves a public read API at `https://synac.app/api/v1`. Every read
endpoint is a GET, needs no authentication, and answers JSON.

The API reads the same active content generation the site pages read, so an API
response never disagrees with the rendered page.

## Routes

| Method | Path                           | Returns                                      |
| ------ | ------------------------------ | -------------------------------------------- |
| GET    | `/api/healthz`                 | liveness plus content backend reachability   |
| GET    | `/api/v1/openapi.json`         | the OpenAPI 3.1 document for the read API    |
| GET    | `/api/v1/search`               | search over entries or senses                |
| GET    | `/api/v1/entries/by-slug`      | one entry, its senses, and its relationships |
| GET    | `/api/v1/terms`                | terms by first letter                        |
| GET    | `/api/v1/acronyms`             | acronyms by first letter                     |
| GET    | `/api/v1/tags`                 | the whole tag directory                      |
| GET    | `/api/v1/sources`              | every source the corpus cites                |
| GET    | `/api/v1/sources/{slug}`       | one source with its license terms            |
| GET    | `/api/v1/senses/citation.json` | provenance for one sense                     |
| GET    | `/api/v1/export/entries.json`  | the whole corpus, 50 entries per page        |
| POST   | `/api/v1/internal/revalidate`  | operator cache drop, bearer secret required  |
| POST   | `/api/v1/csp-report`           | browser CSP report sink                      |

Paging is always `page` plus, where it is adjustable, `pageSize`. No endpoint
takes a `limit` or a `cursor`.

## Search

`GET /api/v1/search?q=<query>&scope=entries|senses&type=&tag=&page=`

| Parameter | Default   | Notes                                                                          |
| --------- | --------- | ------------------------------------------------------------------------------ |
| `q`       | empty     | Trimmed, truncated to 120 characters, lowercased, inner whitespace collapsed.  |
| `scope`   | `entries` | `senses` searches definition text. Any other value reads as `entries`.         |
| `type`    | unset     | `TERM` or `ACRONYM`, case insensitive. Anything else applies no type filter.   |
| `tag`     | unset     | Tag slug. Applies to `scope=entries` only. A malformed slug applies no filter. |
| `page`    | `1`       | 1-based, clamped to 1 through 10.                                              |

Page size is fixed at 20 and is not a parameter.

A query the index would refuse (empty, a single character, or a bare `a`, `an`,
`and`, `or`, `the`) answers `200` with an empty `results` array and
`meta.total` 0, not an error. `snippet` marks the matched run with `<<` and
`>>`.

`scope=entries` returns one row per entry:

```json
{
  "results": [
    {
      "id": "TERM:domain",
      "entryType": "TERM",
      "displayTitle": "domain",
      "primarySlug": "domain",
      "summaryText": "A named region of control in DNS, policy, or hardware.",
      "snippet": "That part of the tree-structured name space of the <<DNS>>",
      "senseCount": 6,
      "senseSummary": "DNS name hierarchy; security or administrative domain",
      "url": "/term/domain"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "hasMore": false,
    "scope": "entries"
  }
}
```

`scope=senses` returns one row per meaning, with the anchor already in `url`:

```json
{
  "results": [
    {
      "entryType": "TERM",
      "slug": "domain",
      "title": "domain",
      "senseKey": "rfc4949:5-i-internet",
      "anchor": "sense-rfc4949-5-i-internet",
      "label": "DNS name hierarchy",
      "expandedForm": null,
      "labelFallback": "RFC 4949 - Internet Security Glossary, Version 2",
      "sourceNames": ["RFC 4949 - Internet Security Glossary, Version 2"],
      "snippet": "at or below the name that specifies the <<domain>>",
      "url": "/term/domain#sense-rfc4949-5-i-internet"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "hasMore": false,
    "scope": "senses"
  }
}
```

## Single entry

`GET /api/v1/entries/by-slug?type=TERM&slug=domain`

Both parameters are required. `type` is `TERM` or `ACRONYM`, case insensitive;
anything else answers `400 invalid_type`. `slug` is lowercase alphanumerics
joined by single hyphens, at most 128 characters; anything else answers
`400 invalid_slug`. An unknown slug answers `404 not_found`.

A redirect slug resolves to its canonical entry, and the response then carries
an extra `canonicalSlug` field naming the slug to follow. The response returns
up to 100 senses and up to 50 relationships.

```json
{
  "canonicalUrl": "https://synac.app/term/domain",
  "entry": {
    "entryType": "TERM",
    "slug": "domain",
    "canonicalUrl": "https://synac.app/term/domain",
    "title": "domain",
    "aliases": [],
    "summary": "A named region of control in DNS, policy, or hardware.",
    "summaryMd": "A named region of control in DNS, policy, or hardware.",
    "editorialNotes": null,
    "updatedAt": "2026-07-31T22:52:32.000Z",
    "tags": [
      { "slug": "networking", "name": "Networking", "assignedBy": "EDITORIAL" }
    ],
    "senses": [
      {
        "key": "rfc4949:5-i-internet",
        "anchor": "sense-rfc4949-5-i-internet",
        "order": 4,
        "label": "DNS name hierarchy",
        "labelFallback": "RFC 4949 - Internet Security Glossary, Version 2",
        "expandedForm": null,
        "disambiguationNote": "Use this meaning when the domain is a DNS name.",
        "definitionText": "That part of the tree-structured name space of the DNS that is at or below the name that specifies the domain.",
        "definitionMd": "That part of the tree-structured name space of the DNS that is at or below the name that specifies the domain.",
        "isEditorial": false,
        "editorialRationale": null,
        "isPreferred": false,
        "examples": [
          {
            "md": "`example.com` and everything under it.",
            "text": "example.com and everything under it."
          }
        ],
        "attestations": [],
        "citations": [
          {
            "sourceSlug": "rfc4949",
            "sourceName": "RFC 4949 - Internet Security Glossary, Version 2",
            "url": "https://www.rfc-editor.org/rfc/rfc4949.txt",
            "documentTitle": "RFC 4949: Internet Security Glossary, Version 2",
            "citationText": "RFC 4949, section \"domain\"",
            "locator": "line 6094",
            "contentMode": "QUOTED",
            "documentSha256": "32d1e3837ae5a7d2e99a63f43c6fea3dd350ffc6ac55b3aaadad250546ad7f87",
            "attributionText": "RFC 4949, Internet Security Glossary, Version 2 (IETF, August 2007)",
            "accessedAt": "2026-07-31T22:52:32.000Z",
            "licenseNote": "IETF RFC; reproduction permitted with attribution.",
            "licenseUrl": "https://www.rfc-editor.org/copyright/",
            "publicStatement": "Reproduced from IETF RFC 4949 with attribution."
          }
        ]
      }
    ]
  },
  "relationships": [
    {
      "type": "RELATED",
      "entryType": "ACRONYM",
      "slug": "dns",
      "title": "DNS",
      "summary": "The Domain Name System.",
      "url": "/acronym/dns"
    }
  ]
}
```

`relationships[].type` is `RELATED`, `SEE_ALSO`, or `CONTRAST`.

The bundles currently published carry no relationships, so the array is empty
for every entry today. It fills in once the next ingest run regenerates the
bundles with the cross-references the adapters now emit.

## Senses, attestations, and citations

A sense is one meaning. Its own `definitionText` and `definitionMd` are the
primary wording, taken from the highest-precedence source for that meaning, and
they are what the site renders.

`attestations` holds the other sources that define the same meaning in their own
words. Each attestation carries that source's wording and the citation behind
it. A sense with no other source attesting it has an empty `attestations` array.

`citations` lists the sense's own citation first, then the citation of each
attestation, deduplicated by source and URL.

```json
{
  "attestations": [
    {
      "key": "nist-csrc-glossary:domain",
      "sourceSlug": "nist-csrc-glossary",
      "sourceName": "NIST CSRC Glossary",
      "definitionText": "A name in the DNS hierarchy together with everything below it.",
      "citation": {
        "sourceSlug": "nist-csrc-glossary",
        "sourceName": "NIST CSRC Glossary",
        "url": "https://csrc.nist.gov/glossary/term/domain",
        "documentTitle": "NIST CSRC Glossary: domain",
        "citationText": "NIST CSRC Glossary, \"domain\"",
        "locator": null,
        "contentMode": "SUMMARIZED",
        "documentSha256": "32d1e3837ae5a7d2e99a63f43c6fea3dd350ffc6ac55b3aaadad250546ad7f87",
        "attributionText": "NIST Computer Security Resource Center Glossary",
        "accessedAt": "2026-07-31T22:52:32.000Z",
        "licenseNote": "United States government work.",
        "licenseUrl": "https://www.nist.gov/oism/copyrights",
        "publicStatement": "NIST glossary text is a United States government work in the public domain."
      }
    }
  ]
}
```

## Browse listings

`GET /api/v1/terms` and `GET /api/v1/acronyms` are the alphabetical listings,
sorted by title.

| Parameter  | Default | Notes                                                                  |
| ---------- | ------- | ---------------------------------------------------------------------- |
| `letter`   | `a`     | A single letter `a` to `z`, or `0-9`. Anything else falls back to `a`. |
| `page`     | `1`     | 1-based, clamped to 1 through 10.                                      |
| `pageSize` | `50`    | Clamped to 1 through 100.                                              |

```json
{
  "results": [
    {
      "entryType": "TERM",
      "slug": "domain",
      "title": "domain",
      "summary": "A named region of control in DNS, policy, or hardware.",
      "senseSummary": "DNS name hierarchy; security or administrative domain",
      "tags": [
        {
          "slug": "networking",
          "name": "Networking",
          "assignedBy": "EDITORIAL"
        }
      ],
      "updatedAt": "2026-07-31T22:52:32.000Z",
      "url": "/term/domain"
    }
  ],
  "meta": {
    "letter": "d",
    "page": 1,
    "pageSize": 50,
    "total": 1,
    "hasMore": false
  }
}
```

`meta.total` counts the matches in that letter bucket, not the whole corpus.

## Tags

`GET /api/v1/tags` takes no parameters and returns the whole directory.

```json
{
  "results": [
    {
      "slug": "networking",
      "name": "Networking",
      "description": "Protocols, addressing, and transport.",
      "entryCount": 42,
      "editorialCount": 30,
      "autoCount": 12,
      "url": "/tags/networking"
    }
  ],
  "meta": { "total": 1 }
}
```

## Sources

`GET /api/v1/sources` takes no parameters and returns every source under
`results`, with `meta.total`. `GET /api/v1/sources/{slug}` returns one source
under a `source` key, `400 invalid_slug` for a malformed slug, and
`404 not_found` for an unknown one.

```json
{
  "source": {
    "slug": "rfc4949",
    "name": "RFC 4949 - Internet Security Glossary, Version 2",
    "baseUrl": "https://www.rfc-editor.org/rfc/rfc4949.txt",
    "licenseType": "OTHER",
    "licenseUrl": "https://www.rfc-editor.org/copyright/",
    "licenseNotes": "IETF RFC; reproduction permitted with attribution.",
    "publicStatement": "Reproduced from IETF RFC 4949 with attribution.",
    "contentMode": "QUOTED",
    "allowedUse": "Reproduce definitions with attribution to the RFC and the IETF.",
    "attributionRequirements": "RFC 4949, Internet Security Glossary, Version 2 (IETF, August 2007)",
    "trustTier": "TIER1",
    "enabled": true,
    "lastVerifiedAt": "2026-02-10T00:00:00.000Z",
    "citedEntryCount": 1289,
    "url": "/sources/rfc4949"
  }
}
```

## Sense provenance

`GET /api/v1/senses/citation.json?type=TERM&slug=domain&sense=rfc4949:5-i-internet`

All three parameters are required. `sense` is the `key` of a sense on that
entry, at most 200 characters, matched literally; a missing or over-long value
answers `400 invalid_sense`, and a key that no sense on the entry carries
answers `404 not_found`.

The response is flat:

| Field                             | Value                                                             |
| --------------------------------- | ----------------------------------------------------------------- |
| `entryType`, `slug`, `entryTitle` | The resolved entry.                                               |
| `senseKey`                        | The sense key you asked for.                                      |
| `senseHeading`                    | The sense `label`, else its `expandedForm`, else `labelFallback`. |
| `anchor`                          | Fragment id of the sense heading, as `sense-<key>`.               |
| `canonicalUrl`                    | Absolute entry URL plus `#` and the anchor.                       |
| `primaryCitation`                 | First entry of the sense `citations`, or `null` when it has none. |
| `attestations`                    | The same array as on the entry sense.                             |

## Bulk export

`GET /api/v1/export/entries.json?page=` is the bulk dataset export. Each page
holds 50 full entry records in the same shape as `entry` above, terms first and
then acronyms. `pageSize` is fixed at 50. `page` is 1-based and clamped to the
last page, so a page number past the end returns the last page rather than an
error.

```json
{
  "license": {
    "editorial": {
      "name": "Creative Commons Attribution 4.0 International",
      "url": "https://creativecommons.org/licenses/by/4.0/",
      "covers": "The editorial layer: entry structure, disambiguation, sense ordering, and tags."
    },
    "sourceText": {
      "covers": "Quoted or attested text reproduced from a source stays under that source license.",
      "note": "Each citation carries licenseUrl and publicStatement identifying the license that governs its text."
    }
  },
  "results": [],
  "meta": { "page": 1, "pageSize": 50, "total": 2480, "hasMore": true }
}
```

Walk pages until `meta.hasMore` is false:

```sh
page=1
while :; do
  body=$(curl -s "https://synac.app/api/v1/export/entries.json?page=$page")
  printf '%s\n' "$body" >> entries.ndjson
  [ "$(printf '%s' "$body" | jq -r '.meta.hasMore')" = "true" ] || break
  page=$((page + 1))
done
```

Use this instead of crawling the listings when you want the whole dataset.

## Schema document

`GET /api/v1/openapi.json` returns the OpenAPI 3.1 document for the public read
surface: every GET route above, its parameters, and its response schemas.
Generate a client from it rather than hand-writing types. The two POST routes
are not described there; they are not part of the read surface.

## Health check

`GET /api/healthz` reads one entry from the content backend.

```json
{ "ok": true, "version": "0.2.0" }
```

A failed backend read answers `503` with `"ok": false`. The response is
`cache-control: no-store`, carries no ETag, and is outside the `/api/v1` rate
limit.

## Operator and browser endpoints

`POST /api/v1/internal/revalidate` drops server cache tags. It needs
`Authorization: Bearer <SYNAC_REVALIDATE_SECRET>` and a JSON body of 1 to 20
tags, each at most 100 characters of `A-Za-z0-9`, `:`, `_`, or `-`.

```sh
curl -sS -X POST https://synac.app/api/v1/internal/revalidate \
  -H "Authorization: Bearer $SYNAC_REVALIDATE_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"tags":["content"]}'
```

It answers `200` with `{"ok":true,"tags":["content"]}`, `401 unauthorized` on a
bearer mismatch, and `400 invalid_body` when the body is not JSON or a tag
fails the check. When `SYNAC_REVALIDATE_SECRET` is unset or shorter than 16
characters the route answers `404 not_found`, so an unconfigured deployment
never admits that the endpoint exists. The Deploy workflow calls it once the
content sync finishes.

`POST /api/v1/csp-report` is the sink for browser CSP violation reports, in
either the `application/csp-report` or the `application/reports+json` shape. It
always answers `204` with no body, and a body over 32 KiB is dropped without
being parsed. It shares the `/api/v1` rate limit and answers a bare `429` with
a `retry-after` header when the caller is over budget.

## Caching

Every `/api/v1` read answers with an `etag` (the quoted sha1 of the serialized
body), `cache-control: public, max-age=60, s-maxage=300,
stale-while-revalidate=3600`, and `vary: Accept-Encoding`.

Send the ETag back as `If-None-Match` on the next request. A match answers
`304 Not Modified` with the same headers and no body. Comma-separated lists,
`*`, and the weak `W/` form all match. Error responses are `no-store`.

The ETag changes when the serialized body changes, so a 304 is a reliable
signal that nothing has changed since the last request, which makes it the
cheapest way to poll for updates.

## Rate limits

All `/api/v1` routes share one budget: 60 requests per minute per caller, in a
fixed window. The caller is identified by a salted hash of the client address
taken from `x-forwarded-for`, falling back to a hash of the user agent when no
address is present. `/api/healthz` is outside the budget.

An over-budget request answers `429`:

```json
{ "error": "rate_limited", "requestId": "abc123", "retryAfterSeconds": 12 }
```

The `retry-after` response header carries the same number of seconds. Honor it.

If you are pulling more than a handful of entries, use the bulk export rather
than crawling the listing endpoints.

## CORS

Every `/api/v1` read route sends `access-control-allow-origin: *`, on success
and on error, so it can be called from any origin. `OPTIONS` on one of those
routes answers `204` with `access-control-allow-methods: GET, OPTIONS` and
`access-control-allow-headers: content-type, if-none-match`. `/api/healthz` and
the two POST routes send no CORS headers and do not answer `OPTIONS`.

## Errors

Errors are JSON with a stable machine-readable code and the request id:

```json
{ "error": "not_found", "requestId": "abc123" }
```

`requestId` echoes the `x-request-id` request header when it is at most 100
characters of `A-Za-z0-9`, `.`, `_`, or `-`, and is `unknown` otherwise.

| Code             | Status | Meaning                                                     |
| ---------------- | ------ | ----------------------------------------------------------- |
| `invalid_type`   | 400    | `type` is not `TERM` or `ACRONYM`.                          |
| `invalid_slug`   | 400    | `slug` is missing, too long, or not a slug.                 |
| `invalid_sense`  | 400    | `sense` is missing or longer than 200 characters.           |
| `invalid_body`   | 400    | Revalidate only: the body is not JSON, or the tags are bad. |
| `unauthorized`   | 401    | Revalidate only: the bearer token does not match.           |
| `not_found`      | 404    | No such entry, sense, or source in the published corpus.    |
| `rate_limited`   | 429    | Over the shared `/api/v1` budget.                           |
| `internal_error` | 500    | An upstream read failed. No internal detail is exposed.     |

## Licensing

The editorial layer is published under CC BY 4.0. That covers the summaries,
the meaning labels, the disambiguation notes, the tag assignments, and the
structure of the dataset itself.

Source wording stays under its own source's license. Every citation carries
`licenseUrl`, `licenseNote`, `publicStatement`, and `attributionText`, so you
never have to guess which terms apply to a given piece of wording.

A consumer who redistributes a definition or an attestation must carry that
source's attribution. Read `docs/content/licensing.md` before you republish
anything.
