# SynAc content

This directory is the **source of truth** for everything the glossary serves.
CI validates it on every PR (`pnpm content:check`) and syncs it into the Convex
deployment when changes land on `main`. Git history is the audit log.

## Layout

| Path                                                          | Owned by                | Purpose                                                                                |
| ------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `sources/<slug>.json`                                         | humans                  | Source registry: license, attribution, trust tier, ingest config                       |
| `tags.json`                                                   | humans                  | Curated tag taxonomy                                                                   |
| `tag-assignments.json`                                        | reviewed machine output | Accepted, provenance-bound Entry/Tag assignments                                       |
| `redirects.json`                                              | humans                  | Slug redirects for renamed entries                                                     |
| `generated/<source>.json`                                     | **machines**            | Per-source content bundles written by the ingest workflow — do not hand-edit           |
| `overrides/term/<slug>.json`, `overrides/acronym/<slug>.json` | humans                  | Per-entry curation: summaries, tags, aliases, editorial senses, suppression (takedown) |

## Rules

- **Never hand-edit `generated/`.** The ingest workflow regenerates those files;
  manual edits will be overwritten. To change how an entry is presented, add an
  override; to remove it, add a `suppress` override.
- Overrides are sparse: only include the fields you are changing.
- Never hand-edit `tag-assignments.json`. Regenerate it through the offline
  tagging backfill, review its deterministic diff report, and merge it through
  the normal content PR. Manual `addTags` and `removeTags` overrides remain
  authoritative; a manual removal wins.
- Tag inference is sparse and event-triggered, never scheduled or request-time.
  Reclassify changed Entries incrementally. A taxonomy, rubric, prompt, model,
  feature, calibration, threshold, or output-schema change requires a full
  rerun. A failed run emits no replacement artifact, so the prior accepted
  assignments remain active.
- An override with `title`, `updatedAt`, and at least one `editorialSenses` item
  defines an editorial-only entry that exists in no source.
- Suppressing an entry (`"suppress": {"reason": "..."}`) is the takedown
  mechanism. The reason is required; link the issue or request when one exists.
- New sources require a registry file with complete license terms
  (`allowedUse`, `attributionRequirements`, `contentMode`) and `enabled: true`
  before their bundles are served. See `docs/content/licensing.md`.

## Source license fields

| Field                       | Required | Purpose                                                                             |
| --------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `type`, `url`               | type     | License identifier and the canonical license text                                    |
| `notes`                     | no       | Internal detail: the reasoning behind `allowedUse`                                   |
| `publicStatement`           | no       | One sentence shown to readers beside a citation                                      |
| `contentMode`               | yes      | `QUOTED`, `SUMMARIZED`, or `PARAPHRASED` — how SynAc reproduces the source's wording |
| `allowedUse`                | yes      | What the license permits, in the maintainers' words                                  |
| `attributionRequirements`   | yes      | The attribution line every citation carries                                          |

`contentMode` travels onto every citation along with the fetched document's
SHA-256, so a page can state exactly how each definition relates to its source.

## Meanings and attestations

Compile folds source definitions that use nearly the same words into one sense
with one attestation per source; the most trusted source supplies the rendered
wording. Definitions that are similar but not the same stay separate, and
compile warns that they need labels so readers can tell them apart. Override
fields for that curation:

| Field                  | Shape                        | Effect                                                             |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `labelSenses`          | `{ "<senseKey>": "Label" }`  | Names a sense heading and clears its needs-label warning            |
| `disambiguationNotes`  | `{ "<senseKey>": "Note." }`  | Short note rendered under the sense heading                        |
| `groupSenses`          | `[["<primary>", "<other>"]]` | Merges the listed senses regardless of similarity; first is primary |
| `splitSenses`          | `["<senseKey>"]`             | Keeps a sense out of automatic grouping                            |

Sense keys are namespaced (`"<sourceSlug>:<senseKey>"`, or `"editorial:<index>"`
for editorial senses) and must match a live sense, otherwise the compile fails.
Editorial senses cannot be merged into a source sense.

## Bootstrap status

`generated/rfc4949.json` holds the full RFC 4949 glossary from a live adapter
run. The other registered sources (NIST, NICCS, OWASP, MITRE ATT&CK) get
their bundles the first time the ingest workflow runs for them
(`Actions → Ingest → Run workflow`), or locally via `pnpm ingest -- --all`.
