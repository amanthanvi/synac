# Public read API

SynAc exposes a read-only JSON API over the published glossary. Everything the
public site renders is available through it: entries, their senses, the tag
taxonomy, and the source registry with its license metadata.

**Base URL:** `https://synac.app/api/v1`

No authentication, no API key, no registration. `GET` only — the write surface
lives under `/api/v1/admin/*` and is not public.

> **Status:** the endpoints below are the v1 contract. Some are still landing;
> `openapi.json` is the authority on what is live right now.

## Conventions

- **Format** — JSON, `application/json; charset=utf-8`. Timestamps are ISO 8601
  UTC strings. Identifiers are UUIDs.
- **Entry types** — `type` is `TERM` or `ACRONYM` (case-insensitive on input,
  uppercase in responses).
- **Slugs** — lowercase, hyphenated, stable. An entry that is renamed keeps its
  old slug resolving via slug history.
- **Sense anchors** — a sense's public URL is the entry URL plus `#s-<slug>`,
  for example `/acronym/soc#s-security-operations-center`.
- **Errors** — a JSON body with an `error` code and, when available, the
  `requestId` to quote in a bug report:

  ```json
  { "error": "not_found", "requestId": "01JC…" }
  ```

  Codes in use: `not_found` (404), `invalid_request` (400), `rate_limited`
  (429), `internal_error` (500).

### Pagination

List endpoints take `page` (1-based; anything else clamps to 1) and return a
fixed page size of **20**. Responses carry a `meta` object:

```json
{
  "results": [],
  "meta": { "page": 1, "pageSize": 20, "total": 137 }
}
```

`total` is present where it is cheap to compute; do not assume it on every
endpoint. Paginate until a page comes back with fewer than `pageSize` items.

## Endpoints

### `GET /entries/by-slug`

Resolve one entry by its public identity and return the full record, including
every published sense with its per-source attestations and citations.

| Parameter | Required | Value                    |
| --------- | -------- | ------------------------ |
| `type`    | yes      | `TERM` or `ACRONYM`      |
| `slug`    | yes      | The entry's primary slug |

A slug that only matches slug history resolves to the current entry; the
response's `entry.primarySlug` is the canonical one, so follow it.

```json
{
  "entry": {
    "id": "…",
    "entryType": "ACRONYM",
    "displayTitle": "SOC",
    "primarySlug": "soc",
    "summaryText": "…",
    "updatedAt": "2026-01-06T00:00:00.000Z",
    "tags": [
      {
        "id": "…",
        "name": "Security Operations",
        "slug": "security-operations"
      }
    ],
    "variants": [{ "variantText": "S.O.C." }],
    "senses": [
      {
        "id": "…",
        "slug": "security-operations-center",
        "senseOrder": 0,
        "senseLabel": "Security Operations Center",
        "expandedForm": "Security Operations Center",
        "disambiguationNote": "…",
        "needsLabel": false,
        "definitionText": "…",
        "url": "/acronym/soc#s-security-operations-center",
        "definitions": [
          {
            "id": "…",
            "definitionText": "…",
            "contentMode": "SUMMARIZED",
            "isPrimary": true,
            "citation": {
              "url": "https://csrc.nist.gov/glossary/term/…",
              "accessedAt": "2026-01-05T00:00:00.000Z",
              "attributionText": "…",
              "source": {
                "name": "NIST CSRC Glossary",
                "sourceSlug": "nist-csrc-glossary"
              }
            }
          }
        ]
      }
    ]
  },
  "relationships": []
}
```

**Senses are the unit of meaning.** One entry can hold several, each with its
own slug, label, and set of attestations. `definitions[]` is one entry per
_source_: several sources can attest the same meaning, and each keeps its own
wording, content mode, and citation. `isPrimary` marks the attestation the site
renders. When attestations of the same sense conflict materially, the sense is
flagged internally and held back from automated publication until a maintainer
resolves it — so what you see through the API has already been reconciled.

### `GET /terms` and `GET /acronyms`

Browse published entries of one type, alphabetically.

| Parameter | Required | Value                                                           |
| --------- | -------- | --------------------------------------------------------------- |
| `letter`  | no       | A single `a`–`z`, or `0` for entries starting with a non-letter |
| `page`    | no       | 1-based page number                                             |

Items are the list shape: `id`, `entryType`, `displayTitle`, `primarySlug`,
`summaryText`, `updatedAt`, `tags[]`.

### `GET /tags`

The full tag taxonomy with published entry counts. Not paginated — the
taxonomy is curated and small.

```json
{
  "tags": [
    {
      "id": "…",
      "name": "Cryptography",
      "slug": "cryptography",
      "description": "Encryption, keys, cryptographic primitives, and certificates.",
      "kind": "DOMAIN",
      "parentId": null,
      "entryCount": 42
    }
  ]
}
```

`kind` is `DOMAIN` or `FACET` and `parentId` gives the hierarchy; see
`docs/content/taxonomy.md`.

### `GET /tags/{slug}/entries`

Published entries carrying a tag.

| Parameter | Required | Value                         |
| --------- | -------- | ----------------------------- |
| `{slug}`  | yes      | Tag slug (path segment)       |
| `type`    | no       | `TERM` or `ACRONYM` to filter |
| `page`    | no       | 1-based page number           |

A slug that has been renamed still resolves through tag slug history; the
response reports the canonical slug.

### `GET /sources`

The source registry — every enabled source SynAc ingests from, with the
license metadata that governs reuse of its content.

```json
{
  "sources": [
    {
      "id": "…",
      "name": "NIST CSRC Glossary",
      "sourceSlug": "nist-csrc-glossary",
      "baseUrl": "https://csrc.nist.gov/glossary",
      "licenseType": "PUBLIC_DOMAIN",
      "licenseNotes": "…",
      "allowedUse": "…",
      "attributionRequirements": "…",
      "trustTier": "TIER_1",
      "lastVerifiedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

`licenseType` and `trustTier` are the same enums the publish gate uses; see
`docs/content/licensing.md`.

### `GET /sources/{slug}`

One source by `sourceSlug`, plus the entries it is cited on. 404 if the source
is unknown or disabled.

### `GET /senses/{id}/citation.json`

A ready-to-use citation record for a single sense — what to quote, who said it,
under what license, and when SynAc retrieved it. Built for reference managers
and for anyone quoting SynAc in writing.

`{id}` is the sense UUID from an entry response.

```json
{
  "sense": {
    "id": "…",
    "label": "Security Operations Center",
    "url": "https://synac.app/acronym/soc#s-security-operations-center"
  },
  "entry": {
    "displayTitle": "SOC",
    "entryType": "ACRONYM",
    "primarySlug": "soc"
  },
  "sources": [
    {
      "name": "NIST CSRC Glossary",
      "url": "https://csrc.nist.gov/glossary/term/…",
      "accessedAt": "2026-01-05T00:00:00.000Z",
      "licenseType": "PUBLIC_DOMAIN",
      "attributionText": "…"
    }
  ],
  "retrievedAt": "2026-09-10T00:00:00.000Z"
}
```

### `GET /search`

| Parameter | Required | Value                                                          |
| --------- | -------- | -------------------------------------------------------------- |
| `q`       | yes      | Query string. Empty returns an empty result set, not an error. |
| `scope`   | no       | `entries` (default) or `senses`                                |
| `type`    | no       | `TERM` or `ACRONYM`                                            |
| `tag`     | no       | Tag slug (entry scope)                                         |
| `page`    | no       | 1-based page number                                            |

Results are ranked best first: exact title or slug match, prefix match,
expansion or alias match, full-text match, then trigram-fuzzy match. The
ranking position is the only signal exposed; internal scores are not returned
because the formula is tuned over time.

**`scope=entries`** (default) searches whole entries and returns entry
summaries with a `snippet` and a `senseSummary`.

**`scope=senses`** searches _meanings_ rather than entries, against the
sense-level index. Use it when the question is "which meaning of this is
which?" rather than "which entry is this?". A query like `soc` returns each
meaning as its own result, so the disambiguation is the answer instead of
something you have to open an entry to find:

```json
{
  "results": [
    {
      "senseId": "…",
      "entryId": "…",
      "entryType": "ACRONYM",
      "entrySlug": "soc",
      "entryTitle": "SOC",
      "senseSlug": "security-operations-center",
      "senseLabel": "Security Operations Center",
      "expandedForm": "Security Operations Center",
      "sourceNames": "NIST CSRC Glossary",
      "snippet": "…",
      "url": "/acronym/soc#s-security-operations-center"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 2 }
}
```

`url` is the deep link to the meaning, anchor included.

### `GET /openapi.json`

The machine-readable OpenAPI 3.1 description of everything above: paths,
parameters, response schemas, and error shapes. It is generated from the
routes, so it is the authority when this page and the implementation disagree —
and it is the right thing to point a code generator at.

### Health

`GET /api/healthz` (note: outside `/v1`) returns liveness for uptime checks.
It is not part of the versioned contract and its body may change.

```json
{ "ok": true }
```

## Dataset export

Bulk snapshots of the published glossary, for people who would rather have the
data than page through an API.

| Endpoint                   | Content type       |
| -------------------------- | ------------------ |
| `GET /export/entries.json` | `application/json` |
| `GET /export/entries.csv`  | `text/csv`         |

Both cover published entries with their senses, labels, disambiguation notes,
tags, and source attribution. The CSV is flattened to one row per sense, so an
entry with three meanings occupies three rows; the JSON keeps the nested shape.
These are full snapshots, not deltas, and they are generated on request — for
repeated use, fetch once and cache, and send `If-None-Match` on the next fetch.

### Export license

The export mixes two licenses and you take on both:

- **SynAc's editorial layer** — sense labels, disambiguation notes,
  `confusedWith` explanations, tag assignments, relationship notes — is
  licensed **CC BY 4.0**. Attribution to SynAc is required.
- **Third-party source content** — the definitions themselves and their
  metadata — retains **each source's own license and attribution
  requirements**. SynAc cannot and does not relicense it. The
  `attributionRequirements` field on each source tells you what that source
  demands; carry it through.

Full terms: `docs/content/licensing.md`.

## Caching

Public pages render dynamically. The expensive part — the database reads behind
them — is wrapped in Next.js `unstable_cache` and keyed by cache tags, so a
page is cheap to re-render but always reflects the current cached data.

The tag vocabulary is `entries`, `tags`, `sources`, and `search`, plus
per-object tags: `entry:<TYPE>:<slug>`, `tag:<slug>`, `source:<slug>`. See
`apps/web/src/lib/cacheTags.ts`.

### ETags and conditional requests

Every public API response carries an `ETag`. Send it back as `If-None-Match`
and an unchanged resource answers **`304 Not Modified`** with no body:

```bash
curl -sD - https://synac.app/api/v1/tags -o /dev/null | grep -i etag
# etag: "a1b2c3…"

curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'If-None-Match: "a1b2c3…"' \
  https://synac.app/api/v1/tags
# 304
```

ETags are strong and content-derived: the same underlying data produces the
same ETag, and a 304 means nothing you care about has changed. Conditional
requests are the cheapest way to poll, and they do not count against you the
way a full fetch does — use them.

Responses also carry `Cache-Control` with a short shared max-age and a longer
stale-while-revalidate window, so a CDN or a shared cache can serve a slightly
stale response while it refreshes in the background. Read the header rather
than hard-coding a TTL; the values are tuned operationally.

### Invalidation

Cached data is purged by tag, not by time, so a content change is visible
immediately rather than after a TTL expires.

- **A publish, archive, rollback, tag change, or source change** invalidates
  the affected tags in-process as part of the write.
- **An out-of-process change** — the worker applying an editorial sync or a
  promotion — calls `POST /api/v1/internal/revalidate` with a
  `Bearer $SYNAC_REVALIDATE_SECRET` header and a list of tags to purge. This
  endpoint is internal, not part of the public contract, and is rejected
  without the secret.
- **A deploy** starts from a cold cache; the first request for each resource
  repopulates it.

## Rate limits

Public endpoints are rate limited per client IP over a rolling window. Search
is the tightest at **60 requests per minute**; other read endpoints are looser.

Exceeding a limit returns **429** with a `Retry-After` header in seconds:

```json
{ "error": "rate_limited", "retryAfterSeconds": 30, "requestId": "…" }
```

Back off on 429 rather than retrying immediately. If you need bulk data, use
the dataset export instead of crawling the API — it is cheaper for both of us.
For a legitimate use case that does not fit these limits, get in touch via the
contact path in `SECURITY.md`.

## Stability and versioning

The `/api/v1` prefix is the compatibility promise. Within v1:

- **Additive changes ship without notice** — new endpoints, new optional
  parameters, new fields in a response. Ignore fields you do not recognize, and
  do not treat an unexpected field as an error.
- **Breaking changes get a new version prefix.** Removing a field, renaming
  one, changing a type, or changing the meaning of an existing parameter will
  not happen in place under `/v1`.
- **Not covered by the promise:** ranking order, the
  exact wording of error messages, `Cache-Control` values, `/api/healthz`, and
  anything under `/api/v1/admin/*` or `/api/v1/internal/*`.

Deprecations are announced in `CHANGELOG.md` before removal.

## Related docs

- Licensing, attribution, and takedowns: `docs/content/licensing.md`
- Tag taxonomy: `docs/content/taxonomy.md`
- Editorial layer: `docs/content/editorial-layer.md`
- Architecture and caching model: `docs/architecture/overview.md`
