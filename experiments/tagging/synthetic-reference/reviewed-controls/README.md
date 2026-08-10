# Reviewed source controls

This directory accepts source-verifiable controls for the frozen 11-tag rubric.
It contains no control data by default. Reviewers author exactly one optional
file per tag, named `<tag-slug>.json`; the builder rejects any foreign JSON file.

## File schema

```json
{
  "schemaVersion": "synac-reviewed-controls-v1",
  "tagId": "T01",
  "tagSlug": "identity-access",
  "rows": [
    {
      "entryKey": "TERM:example-entry",
      "polarity": "positive",
      "ruleId": "T01-I01",
      "senseKey": "source:exact-sense-key",
      "quote": "Exact nonempty text from that sense",
      "rationale": "The quoted source text directly entails the cited rubric rule.",
      "primaryReviewer": "reviewer-id-1",
      "secondaryReviewer": "reviewer-id-2"
    }
  ]
}
```

Every object is strict: extra or missing properties fail the build. The file's
`tagId` and `tagSlug` must match its frozen rubric tag and file name.

## Evidence rules

- `entryKey` must identify an exact live compiled Entry.
- `senseKey` must identify an exact live sense belonging to that Entry.
- `quote` is case-sensitive and must occur verbatim in that sense's definition,
  label, expanded form, or an example. Titles, aliases, summaries, search text,
  relationships, and inferred keywords are not acceptable source evidence.
- `ruleId` must be one exact global rule ID or, for positive rows, an inclusion
  rule for the file's tag; for negative rows, an exclusion rule for that tag.
- `rationale` must be nonempty, source/rubric-entailment specific, and no more
  than 60 words.
- Reviewer IDs must be nonempty, trimmed, and distinct. Two reviewers attest to
  the source/rubric entailment; model output is not review evidence.
- One Entry/tag cell may occur only once. Conflicting polarities, repeated rows,
  and overlap with a public anchor all fail.

Exactly 25 positive and 25 negative reviewed rows per tag combine with the five
positive and five negative public anchors to produce 30/30 controls per tag and
660 overall. Fewer rows remain an explicit shortfall. More than 30 combined
controls in either polarity fail; quotas are never satisfied by fabrication or
silent truncation.

The builder derives `entryHash`, `controlId`, and the deterministic 15/15
qualification split. It forces every reviewed-control concept family into the
development partition and hashes each raw reviewed file into both the control
artifact and manifest code binding. Do not add derived fields to source files.
