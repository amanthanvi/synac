# The editorial layer

Most of what SynAc publishes comes from ingested sources: definitions,
citations, license notes. The **editorial layer** is the part SynAc writes
itself — the labels that tell two meanings apart, the notes that explain why
people confuse them, the tags that place an entry in the taxonomy.

It lives in the repository as YAML, in `content/entries/**/*.yaml`, and is
applied to the database by the worker's `editorial_sync` job. Because it is
files in git, an editorial contribution is a pull request: reviewable,
attributable, and revertable.

Implementation: `apps/worker/src/editorial/contentSync.ts`.

## Layout

```
content/
  entries/
    term/
      authentication.yaml
    acronym/
      soc.yaml
```

One file per entry. The sync walks `content/` recursively and reads every
`.yaml` / `.yml` file, so the directory shape is a convention for humans rather
than something the loader depends on — but follow it, because it is how a
reviewer finds the file for an entry. Name the file after the entry's
`primarySlug`.

Symlinks are refused and paths that escape `content/` are refused, so a YAML
file cannot be used to read something else off disk.

## Schema

The parser is **strict**: an unrecognized key is an error, not a warning. That
is deliberate — a typo'd `disambiguationNotes` should fail loudly rather than
be silently ignored.

```yaml
# Editorial metadata for the SOC acronym entry.
# Applied against the PUBLISHED entry with entryType ACRONYM and
# primarySlug "soc".

entryType: ACRONYM # required — TERM | ACRONYM
slug: soc # required — the entry's primarySlug

senses:
  - slug: security-operations-center # required — matches Sense.slug
    label: Security Operations Center # optional — the human label
    disambiguationNote: >- # optional — SynAc's own wording
      The staffed facility or function that monitors, detects, and responds to
      security events. This is the sense intended in defensive operations
      contexts unless a compliance report is being discussed.
    preferred: true # optional — at most one per entry
    confusedWith:
      - slug: noc # required — the other entry's primarySlug
        entryType: ACRONYM # required — TERM | ACRONYM
        note: >- # optional — why they get confused
          A NOC watches availability and performance; a SOC watches security
          events. Many organizations run both, sometimes from the same room.

  - slug: system-and-organization-controls
    label: System and Organization Controls
    disambiguationNote: >-
      The AICPA audit reporting framework (SOC 1, SOC 2, SOC 3). Used in
      compliance and vendor assurance contexts, not operations.

tags:
  - slug: security-operations # required — must already exist in the taxonomy
    assignedBy: EDITORIAL # optional — EDITORIAL is the only accepted value

relationships:
  - type: RELATED # required — see the list below
    targetSlug: incident-response # required
    targetEntryType: TERM # required — TERM | ACRONYM
    note: A SOC is the usual operational home of the incident response process.
  - type: SEE_ALSO
    targetSlug: siem
    targetEntryType: ACRONYM
    note: SIEM platforms are the primary tooling a SOC operates.
```

### Top level

| Field           | Required | Meaning                                                                 |
| --------------- | -------- | ----------------------------------------------------------------------- |
| `entryType`     | yes      | `TERM` or `ACRONYM`. With `slug`, identifies the entry.                 |
| `slug`          | yes      | The entry's `primarySlug` — the `/term/…` or `/acronym/…` path segment. |
| `senses`        | no       | Editorial metadata for individual meanings.                             |
| `tags`          | no       | Editorial tag assignments.                                              |
| `relationships` | no       | Editorial relationships to other entries.                               |

### `senses[]`

| Field                | Required | Meaning                                                                                              |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `slug`               | yes      | Matches `Sense.slug` on the entry. This is the anchor in the page URL: `#s-<slug>`.                  |
| `label`              | no       | The short human name for the meaning. Sets `Sense.senseLabel`.                                       |
| `disambiguationNote` | no       | SynAc's own prose explaining when this meaning is the one intended. Sets `Sense.disambiguationNote`. |
| `preferred`          | no       | Marks this as the entry's default meaning. Sets `Sense.isPreferred`.                                 |
| `confusedWith[]`     | no       | Other entries readers mistake this meaning for.                                                      |

**`preferred`** is exclusive within an entry. Setting `preferred: true` demotes
every sibling sense that was previously preferred, in the same run, with an
audit event for each demotion. Only mark a sense preferred when it is
editorially justified — when a reader who arrives with no context is most
likely to mean that one. If no sense is clearly dominant, leave it unset;
"there is no default meaning" is useful information.

**`confusedWith[]`** creates an `OFTEN_CONFUSED_WITH` relationship from this
entry to the named one. Each item is `{ slug, entryType, note? }`. It is the
strongest editorial signal SynAc has: it says _readers get these two wrong_,
not merely that they are related. The `note` is where you explain the
distinction in one or two sentences — that note is the whole point of the
pairing.

If the target entry does not exist, or the target is the entry itself, the item
is skipped and logged; it does not fail the file.

### `tags[]`

| Field        | Required | Meaning                                                      |
| ------------ | -------- | ------------------------------------------------------------ |
| `slug`       | yes      | An existing tag slug. The sync does not create tags.         |
| `assignedBy` | no       | Must be `EDITORIAL` if present. Any other value is an error. |

The tag must already exist in the taxonomy — an unknown slug is skipped and
logged, not created. Proposing a _new_ tag is a separate conversation; see
`docs/content/taxonomy.md`.

Assigning a tag here also **upgrades** an existing `AUTO` assignment to
`EDITORIAL`, which is how you make a tag stick: the auto-tagger is never
allowed to withdraw an `EDITORIAL` link.

### `relationships[]`

| Field             | Required | Meaning                                                                           |
| ----------------- | -------- | --------------------------------------------------------------------------------- |
| `type`            | yes      | `RELATED`, `BROADER_THAN`, `NARROWER_THAN`, `OFTEN_CONFUSED_WITH`, or `SEE_ALSO`. |
| `targetSlug`      | yes      | The other entry's `primarySlug`.                                                  |
| `targetEntryType` | yes      | `TERM` or `ACRONYM`.                                                              |
| `note`            | no       | Why the relationship exists.                                                      |

`OFTEN_CONFUSED_WITH` can be expressed here too, but prefer
`senses[].confusedWith` when the confusion is about a _specific meaning_ — that
is almost always the more precise claim.

## How `editorial_sync` applies it

The job is a pg-boss queue (`editorial_sync`) that scans the content directory
and applies each document. Three properties matter:

**It is idempotent.** Every write is conditional on the value actually
differing from what is stored. Running the sync twice over an unchanged
`content/` applies zero changes and writes zero audit events. Re-running it is
always safe.

**Everything it writes is editorial provenance.** Tag links are written with
`assignedBy: EDITORIAL`. Relationships and sense updates are attributed to the
system actor and recorded in the audit log (`SENSE_UPDATE`,
`ENTRY_TAG_UPDATE`, `ENTRY_RELATIONSHIP_CREATE`), so every editorial change has
a trail back to the commit that caused it.

**It never overwrites source attestations.** The sync writes exactly three
sense fields — `senseLabel`, `disambiguationNote`, `isPreferred` — plus tag
links and relationships. It does not touch `definitionMd`, `sense_definitions`,
citations, or field provenance. A source's attested wording of a meaning is the
source's; the editorial layer decorates it and never edits it.

### What gets skipped

Skips are logged and counted, not fatal. The sync is resilient by design,
because `content/` and the database drift independently.

- **Entry not found, not published, or soft-deleted** — the whole file is
  skipped. You can add YAML for an entry before it is published; it takes
  effect on the next sync after publication.
- **Sense slug not found on the entry** — that sense block is skipped.
- **Tag slug not in the taxonomy** — that tag is skipped.
- **Relationship target missing, or pointing at itself** — that relationship is
  skipped.
- **Invalid YAML or an unrecognized field** — that file is rejected in full and
  reported with the offending field path. Other files still apply.

### What it does not do

The sync is **additive**. Removing a block from a YAML file does not remove
what a previous run created — a deleted `confusedWith` entry leaves the
relationship in place, and a deleted tag leaves the link in place. Undoing an
applied editorial change is a maintainer action in `/admin`. Say so in your PR
if a change needs one.

## Contributing an editorial change

1. **Fork** the repository and branch.
2. **Find or create the file** for the entry: `content/entries/<term|acronym>/<slug>.yaml`.
   The `slug` is the last path segment of the entry's public URL.
3. **Get the sense slugs right.** They are the fragment identifiers on the
   entry page: `/acronym/soc#s-security-operations-center` means the sense slug
   is `security-operations-center`. A sense slug that does not match is
   silently skipped, so check it against the live page.
4. **Write the note in your own words.** See the boundary below.
5. **Open a PR.** Explain what confusion the change resolves. Screenshots are
   not needed; the reasoning is.
6. **Maintainer review.** Editorial YAML is reviewed for accuracy, licensing,
   and tone (`docs/voice.md`) — the same bar as any content change.
7. **Merge, then sync.** `editorial_sync` picks the change up on its next run
   and applies it to production. Nothing is applied from an unmerged branch.

## What belongs here, and what needs a citation

**Belongs in the editorial layer** — SynAc's own editorial judgment, written by
you:

- Sense labels and disambiguation notes.
- `confusedWith` pairings and the explanation of the distinction.
- Which sense is `preferred`.
- Tag assignments from the existing taxonomy.
- Relationships between entries, and notes explaining them.

**Requires a source citation instead** — anything that asserts what a term
_means_:

- A definition, in whole or in part. Definitions come from registered sources
  through the ingest pipeline, with a citation, a license, and provenance.
- A claim of fact about a standard, protocol, or product ("X requires Y",
  "version 2 deprecated Z").
- Expanded forms of an acronym, which are attested by sources.

If you want to change what an entry _says_, open a content-correction issue
with the source that supports it. If you want to change how a reader _tells two
meanings apart_, that is editorial and belongs in a YAML PR.

**Never** paste text copied from a source into a disambiguation note. The
editorial layer is licensed CC BY 4.0 on the premise that SynAc wrote it; text
lifted from a source breaks that premise and creates a licensing problem that
is expensive to unwind.

## License

The editorial layer — everything under `content/**` — is licensed
**CC BY 4.0**. By contributing YAML you agree to license your contribution
under those terms.

This is distinct from the MIT license on the code and from the licenses on
third-party source content. See `docs/content/licensing.md`.

## Related docs

- Tag taxonomy and auto-tagging: `docs/content/taxonomy.md`
- Licensing and the takedown policy: `docs/content/licensing.md`
- Writing tone: `docs/voice.md`
- Contribution workflow: `CONTRIBUTING.md`
