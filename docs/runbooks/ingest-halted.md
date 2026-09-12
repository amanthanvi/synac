# Runbook: Ingest halted

Ingest runs as the scheduled `Ingest` GitHub Actions workflow, which
regenerates `content/generated/*` bundles and opens a PR when content changed.

## Triage

- Check the latest `Ingest` workflow runs (Actions tab) for failures.
- A failing adapter prints a failure line naming the source slug and the error
  in the "Regenerate bundles" step. Typical causes are a changed upstream
  HTML or JSON layout, an upstream outage, or a moved URL.
- `pnpm content:check` failures mean the regenerated bundle violates the
  content schema. Treat that as an adapter bug.

## Mitigation

- Reproduce locally: `pnpm ingest -- --source <slug>`.
- Upstream outage: re-run the `Ingest` workflow later. It still has a
  `workflow_dispatch` trigger with an optional `source` input.
- Parser drift: fix the adapter in `tools/ingest/src/adapters/` (tests live
  next to each adapter).
- Broken source: set `"enabled": false` in `content/sources/<slug>.json` via
  PR; its content stops being served after the next sync, and the adapter is
  skipped.
