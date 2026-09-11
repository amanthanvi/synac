# Content + licensing policy

SynAc publishes **third-party sourced content** with explicit attribution and
provenance. Three different licenses apply to three different things, and they
do not override one another:

| Layer               | What it covers                                                                                    | License                              |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Code                | Everything in this repository that is not content                                                 | MIT (see `LICENSE`)                  |
| Editorial layer     | SynAc's own wording: sense labels, disambiguation notes, tags, relationship notes in `content/**` | CC BY 4.0                            |
| Third-party content | Ingested definitions, quotations, and source metadata                                             | Whatever the source says (see below) |

## Principles

- Prefer authoritative sources (standards bodies, reputable orgs, primary
  documentation).
- Preserve attribution: users should be able to trace claims back to sources.
- Respect license requirements (attribution, share-alike, restrictions, etc.).

## License gate

Every ingest item is evaluated against the license of the source it came from.
The evaluation produces a `LicenseGate` value of `PASS`, `WARN`, or `FAIL`,
stored on the ingest item along with a human-readable reason string.

The license type is the `LicenseType` enum on `sources.license_type`; the exact
enum members are defined in `packages/db/prisma/schema.prisma`.

| Source license / condition                         | Gate |
| -------------------------------------------------- | ---- |
| `PUBLIC_DOMAIN`                                    | PASS |
| `CC0_1_0`                                          | PASS |
| `CC_BY_4_0`                                        | PASS |
| `CC_BY_SA_4_0`                                     | WARN |
| `OTHER`                                            | WARN |
| `PROPRIETARY`                                      | FAIL |
| `QUOTED` content from a non-permissive source      | WARN |
| `QUOTED` content from a `PROPRIETARY` source       | FAIL |
| Missing or stale (> 180 days) license verification | WARN |

Notes on how the gate composes:

- `QUOTED` is a `ContentMode` on the extracted definition
  (`QUOTED | SUMMARIZED | PARAPHRASED`). Quoting reproduces source wording
  verbatim, so it is only unconditionally safe from a `PASS` license.
- License verification freshness comes from `sources.last_verified_at`. Missing
  or older than **180 days** downgrades a `PASS` to `WARN`; it never upgrades a
  `FAIL`.
- A `QUOTED` item from a source whose `defaultContentMode` asks for
  summarization is also downgraded to `WARN`. The verbatim text is kept,
  because an attestation has to stay faithful to what the source said, and the
  item is routed to review rather than dropped.
- The gate is a floor, not a ceiling: the most restrictive applicable condition
  wins, and conditions only ever escalate. A `PROPRIETARY` source is `FAIL`
  regardless of how recently it was verified.

### Publish rules

- `PASS` is eligible for automated publication from a Tier 1 source.
- `WARN` **never auto-publishes.** A human reviews and approves it in
  `/admin`. The single exception is the explicit escape hatch
  `SYNAC_AUTOPUBLISH_WARN=true`, which is off by default and is intended for
  controlled backfills, not steady-state operation.
- `FAIL` never publishes, by any path, with or without an environment
  flag. The item stays visible in the admin queue with its reason string so the
  source registration can be fixed or the source retired.

Automated publication also requires the source to be Tier 1, enabled,
and verified, and requires every published sense to carry a citation (or an
explicit editorial rationale). See `docs/runbooks/ingest-promotion.md`.

## The editorial layer

SynAc's own editorial contributions (sense labels, disambiguation notes,
`confusedWith` pairings, tag assignments, and relationship notes) live in
`content/entries/**/*.yaml` and are licensed **CC BY 4.0**. Reuse is encouraged;
attribution to SynAc is required.

This license covers SynAc's wording only. It does not, and cannot, relicense the
third-party definitions those notes sit next to. When you reuse a SynAc dataset
export, you take on both obligations: CC BY 4.0 for the editorial layer, and
each source's own terms for the sourced content.

Schema and workflow: `docs/content/editorial-layer.md`.

## What contributors should (and shouldn't) do

Good contributions:

- Report an incorrect/unclear entry with citations (use the "Content
  correction" issue template).
- Propose editorial YAML in `content/**`: a clearer sense label, a
  disambiguation note in your own words, a `confusedWith` pairing.
- Suggest improved wording that is clearly your own, plus a source that
  supports it.
- Add documentation that explains how SynAc handles provenance and attribution.

Not acceptable:

- Copy/pasting large chunks of copyrighted text into the repo.
- Adding a source without clearly understanding its license/terms.
- Removing attribution/provenance behavior.

## Source requests

If you want to propose a new source:

1. Open a "Source request" issue.
2. Include:
   - the source URL,
   - the license/terms URL,
   - why it's valuable,
   - and how it can be accessed (HTML, PDF, CSV, API, etc.).

## Trademarks

Product, vendor, standard, and organization names that appear in SynAc are the
trademarks or registered trademarks of their respective owners. They are used
here for identification and reference only.

SynAc is an independent project. It is not affiliated with, sponsored by, or
endorsed by any of the vendors, standards bodies, or organizations whose terms
or documents it references.

## Takedowns and corrections

If you believe content should be removed or corrected:

- For non-security issues: open an issue (content correction) with sources and
  context.
- For security-related issues: follow `SECURITY.md`. Do not open a public
  issue.
- For a formal takedown or licensing complaint: email the address in
  `SECURITY.md`. Include the affected URLs, the content at issue, the basis for
  the request, and how to contact you.

**Service level:**

- **Acknowledge within 3 business days** of receipt.
- **Resolve within 7 business days.** Remove or correct the content, disable
  the source, or reply with a reasoned decision.

Takedown requests are tracked internally as case records with timestamps, the
actions taken, and the affected content list. Removals purge derived items as
well as the original, so a takedown does not leave a copy behind in search or
in an export.
