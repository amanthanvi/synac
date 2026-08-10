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
  (`allowedUse`, `attributionRequirements`) and `enabled: true` before their
  bundles are served. See `docs/content/licensing.md`.

## Bootstrap status

`generated/rfc4949.json` holds the full RFC 4949 glossary from a live adapter
run. The other registered sources (NIST, NICCS, OWASP, MITRE ATT&CK) get
their bundles the first time the ingest workflow runs for them
(`Actions → Ingest → Run workflow`), or locally via `pnpm ingest -- --all`.
