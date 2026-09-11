# Editorial content

This directory is the git-tracked editorial layer for SynAc. Files here carry
human-curated metadata (sense labels, disambiguation notes, preferred senses,
tags, and relationships) that is applied on top of entries already present in
the database. It is a metadata overlay, not a source of entries: nothing in this
directory creates, publishes, or deletes an entry.

## Layout

```
content/
  README.md
  entries/
    acronym/<primary-slug>.yaml
    term/<primary-slug>.yaml
```

The sync walks `content/entries/**` recursively and picks up every `*.yaml` and
`*.yml` file. The directory names are a human convention only; the `entryType`
field inside each document is what the sync uses. One document per file, named
after the entry's `primarySlug`.

Paths are resolved and checked against the content root before being read; any
path that escapes the root, and any symlink, is skipped.

## Document schema

```yaml
entryType: ACRONYM # required, "TERM" | "ACRONYM"
slug: soc # required, string, matches Entry.primarySlug

senses: # optional array
  - slug: security-operations-center # required, string, matches Sense.slug
    label: Security Operations Center # optional string -> Sense.senseLabel
    disambiguationNote: '...' # optional string -> Sense.disambiguationNote
    preferred: true # optional boolean -> Sense.isPreferred
    confusedWith: # optional array
      - slug: noc # required, string, target Entry.primarySlug
        entryType: ACRONYM # required, "TERM" | "ACRONYM"
        note: '...' # optional string -> EntryRelationship.note

tags: # optional array
  - slug: operations # required, string, matches Tag.slug
    assignedBy: EDITORIAL # optional; only "EDITORIAL" is accepted, and it is the default

relationships: # optional array
  - type: RELATED # required RelationshipType (see below)
    targetSlug: incident-response # required, string, target Entry.primarySlug
    targetEntryType: TERM # required, "TERM" | "ACRONYM"
    note: '...' # optional string
```

`RelationshipType` is one of `RELATED`, `BROADER_THAN`, `NARROWER_THAN`,
`OFTEN_CONFUSED_WITH`, `SEE_ALSO`. Each `confusedWith` item is shorthand for an
`OFTEN_CONFUSED_WITH` relationship from this entry to the named target.

Unknown fields are rejected. A typo such as `disambiguationNotes` fails
validation rather than being silently ignored.

## How the sync behaves

- **Entry match.** The document is applied to the single non-deleted,
  `PUBLISHED` entry matching `(entryType, primarySlug)`.
- **Skip on unknown slug.** If no such entry exists the file is counted in
  `entriesSkipped`, logged as `editorial.sync.entry_skipped` with
  `reason: entry_not_found`, and the sync moves on. An unknown slug is never an
  error, so content can be written ahead of an entry being published. The same
  applies to unknown sense slugs, unknown tag slugs, and unresolvable
  relationship targets.
- **Invalid files never abort the run.** A YAML parse failure or a schema
  violation increments `filesInvalid`, appends `{ file, message }` to `errors`,
  logs `editorial.sync.file_invalid`, and processing continues with the next
  file.
- **Idempotency.** Every write is preceded by a read of the current row, and an
  update is issued only when a field actually differs. Running the sync twice in
  a row over unchanged content applies zero changes on the second run.
- **Omitted means unchanged.** A field left out of the YAML is not written. It
  does not clear the existing database value; only fields present in the
  document are applied.
- **Preferred senses.** Setting `preferred: true` on a sense also demotes any
  sibling sense of the same entry that is currently preferred, so exactly one
  preferred sense remains.
- **Relationships.** A relationship is created only when no non-deleted
  relationship with the same `(fromEntryId, toEntryId, relationshipType)`
  already exists. Existing relationships are left untouched; the sync never
  deletes one. Self-relationships are skipped.
- **Tags.** `EntryTag` rows are upserted with `assignedBy: EDITORIAL`. A change
  is counted only when the row is created or its `assignedBy` actually changes.
  The sync does not remove tags that are absent from the document.
- **Audit trail.** Each applied change writes an `AuditEvent` with the system
  actor (or an explicitly supplied actor): `SENSE_UPDATE` on `SENSE`,
  `ENTRY_TAG_UPDATE` on `ENTRY`, `ENTRY_RELATIONSHIP_CREATE` on `ENTRY`, each
  carrying JSON-safe `before`/`after` snapshots.
- **Missing directory.** If `content/` does not exist the sync logs a warning
  and returns zeroed counts rather than throwing.

## Running the sync

The worker runs it on a pg-boss schedule as the `editorial_sync` job, every 15
minutes.

To run it once by hand against the configured `DATABASE_URL`:

```
pnpm --filter @synac/worker editorial:sync
```

The result object reports `filesScanned`, `filesValid`, `filesInvalid`,
`entriesMatched`, `entriesSkipped`, `changesApplied`, and the collected
`errors`. Structured log lines emitted during a run are
`editorial.sync.start`, `editorial.sync.file_invalid`,
`editorial.sync.entry_skipped`, `editorial.sync.changed`, and
`editorial.sync.done`.

## Editing checklist

1. Confirm the entry exists and is published, or accept that the file will be
   skipped until it is.
2. Confirm sense slugs, tag slugs, and relationship targets exist; each is
   skipped individually if it does not.
3. Keep one document per file, named after the entry's primary slug.
4. Run the worker editorial tests after changing the schema-bearing examples:
   `pnpm --filter @synac/worker test -- --dir src/editorial`.
