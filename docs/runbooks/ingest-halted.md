# Runbook: Ingest halted

## Triage

- Check worker process health and logs.
- Check `pg-boss` queue depth and schedules.
- Verify the source is still enabled and verified.
- Check worker logs for:
  - `ingest.run.failed`
  - `worker.ingest_cron.source_not_found`
  - `promotion.sync_sources.ok`
  - `promotion.import_runs.ok`
  - `autopublish.tier1.ok`
- If staging-first ingest is enabled, verify whether the failure is in:
  - staging ingestion,
  - promotion import,
  - or Tier-1 auto-apply/autopublish.

## Mitigation

- Restart worker.
- Disable the offending source (if adapter or upstream is failing).
- Re-run ingest manually from `/admin/ingest`.
- If promotion is the bottleneck, inspect prod worker logs for imported/applied/skipped counts before retrying.

