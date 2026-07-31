# Runbook: Bad or infringing content

All served content comes from `content/` in this repository, so every fix is
a pull request; merging to `main` republishes automatically.

## Wrong or misleading entry content

- Prefer an override: edit
  `content/overrides/{term,acronym}/<slug>.json` (summary, tags, aliases,
  editorial senses).
- If machine-extracted text is wrong, fix the adapter (see
  `tools/ingest/`) — never hand-edit `content/generated/**`.

## Takedown / removal

1. Add a suppress override:
   `{"suppress": {"reason": "<why>", "reference": "<issue url>"}}`
2. Merge — the entry disappears from the site after the sync completes.
3. For urgent cases, run the deploy workflow manually (`workflow_dispatch`)
   right after merging.

## Whole-source problems

Set `"enabled": false` in `content/sources/<slug>.json`; the source's entire
bundle stops being served after the next sync.
