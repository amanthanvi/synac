# Runbook: Bad or infringing content

All served content comes from `content/` in this repository, so every fix is
a pull request; merging to `main` republishes automatically.

## Wrong or misleading entry content

- Prefer an override: edit
  `content/overrides/{term,acronym}/<slug>.json` (summary, tags, aliases,
  editorial senses).
- If machine-extracted text is wrong, fix the adapter (see
  `tools/ingest/`). Never hand-edit `content/generated/**`.

## Takedown / removal

1. Add a suppress override:
   `{"suppress": {"reason": "<why>", "reference": "<issue url>"}}`
2. Merge to `main`. That triggers the Deploy workflow, and the entry
   disappears from the site once the sync completes.
3. If the sync needs a retry, push an empty commit to `main` to force a
   resync: `git commit --allow-empty -m "chore: redeploy" && git push`.

## Whole-source problems

Set `"enabled": false` in `content/sources/<slug>.json`; the source's entire
bundle stops being served after the next sync.
