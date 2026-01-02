# Runbook: Ingest halted

## Triage

- Check worker process health and logs.
- Check `pg-boss` queue depth and schedules.
- Verify the source is still enabled and verified.

## Mitigation

- Restart worker.
- Disable the offending source (if adapter or upstream is failing).
- Re-run ingest manually from `/admin/ingest`.

