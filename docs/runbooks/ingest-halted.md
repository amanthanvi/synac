# Runbook: Ingest halted

Symptom: enabled sources stop producing ingest runs, or runs never start.

## Triage

- Check worker process health and logs.
- Confirm the worker is in a mode that runs ingest. `SYNAC_WORKER_MODE` must be
  `ingest` or `all`; on startup the worker logs `worker.mode` with the resolved
  mode, then `worker.ready`.
- Check `pg-boss` queue depth and schedules.
- Verify the source is still enabled and verified.

### Log events to look for

Schedule registration (`ingest_cron` schedules are rebuilt from enabled sources
with a non-empty `cron_schedule`, at startup and every 10 minutes):

- `worker.schedule.sync_complete` includes `enabledSourceCount`,
  `scheduledSourceCount`, `existingScheduleCount`. If `scheduledSourceCount` is
  0, no source has a cron schedule and nothing will ever fire.
- `worker.schedule.initial_sync_failed`, `worker.schedule.sync_failed`,
  `worker.schedule.schedule_failed`, `worker.schedule.unschedule_failed`

Cron job skips. The worker logs **`worker.ingest_cron.skip`** with `sourceId`
and a `reason`:

| `reason`                           | What to do                                                            |
| ---------------------------------- | --------------------------------------------------------------------- |
| `source_not_found`                 | The schedule outlived the source. It is unscheduled on the next sync. |
| `source_disabled`                  | Re-enable in Admin → Sources if that was not intentional.             |
| `missing_allowed_use`              | Fill in the source's allowed-use field.                               |
| `missing_attribution_requirements` | Fill in the source's attribution requirements.                        |
| `missing_last_verified_at`         | Re-verify the source and set `last_verified_at`.                      |
| `ingest_run_already_running`       | A previous run is stuck in `RUNNING`; see Mitigation.                 |

The last four are the license/provenance gate doing its job. An incomplete
Source Registry row is a stop, not a warning. See `docs/content/licensing.md`.

Run execution:

- `ingest.run.start`, `ingest.run.success`, `ingest.run.failed`

Promotion (prod worker only): `promotion.sync_sources.ok`,
`promotion.import_runs.ok`, `autopublish.tier1.ok`, `autopublish.item_failed`.

- If staging-first ingest is enabled, verify whether the failure is in:
  - staging ingestion,
  - promotion import,
  - or Tier-1 auto-apply/autopublish.

For promotion-specific failures use `docs/runbooks/ingest-promotion.md`.

## Mitigation

- Restart the worker.
- If `worker.ingest_cron.skip` reports `ingest_run_already_running`, find the
  stuck `ingest_runs` row (`status = 'RUNNING'`) for that source and resolve it;
  the cron will not queue another run for that source until it clears.
- Disable the offending source (if the adapter or upstream is failing): Admin →
  Sources, or `POST /api/v1/admin/sources/{id}/disable`.
- Re-run ingest manually from `/admin/ingest`.
- If promotion is the bottleneck, inspect prod worker logs for
  imported/applied/skipped counts before retrying.

## Follow-up

- If the cause was a missing registry field, fix the source row rather than
  loosening the gate.
