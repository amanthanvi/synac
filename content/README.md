# SynAc content

This directory is the **source of truth** for everything the glossary serves.
CI validates it on every PR (`pnpm content:check`) and syncs it into the Convex
deployment when changes land on `main`. Git history is the audit log.

## Layout

| Path | Owned by | Purpose |
| --- | --- | --- |
| `sources/<slug>.json` | humans | Source registry: license, attribution, trust tier, ingest config |
| `tags.json` | humans | Curated tag taxonomy |
| `redirects.json` | humans | Slug redirects for renamed entries |
| `generated/<source>.json` | **machines** | Per-source content bundles written by the ingest workflow — do not hand-edit |
| `overrides/term/<slug>.json`, `overrides/acronym/<slug>.json` | humans | Per-entry curation: summaries, tags, aliases, editorial senses, suppression (takedown) |

## Rules

- **Never hand-edit `generated/`.** The ingest workflow regenerates those files;
  manual edits will be overwritten. To change how an entry is presented, add an
  override; to remove it, add a `suppress` override.
- Overrides are sparse: only include the fields you are changing.
- An override with `title`, `updatedAt`, and at least one `editorialSenses` item
  defines an editorial-only entry that exists in no source.
- Suppressing an entry (`"suppress": {"reason": "..."}`) is the takedown
  mechanism. The reason is required; link the issue or request when one exists.
- New sources require a registry file with complete license terms
  (`allowedUse`, `attributionRequirements`) and `enabled: true` before their
  bundles are served. See `docs/content/licensing.md`.

## Bootstrap status

`generated/rfc4949.json` currently contains a **small pre-bootstrap sample**
(adapterVersion `sample-0`) so the pipeline can be exercised end to end. It is
replaced by real data the first time the ingest workflow runs (or by the
one-time production export transform in `tools/content/`).
