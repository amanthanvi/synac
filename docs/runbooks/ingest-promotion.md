# Runbook: Ingest promotion (staging → prod)

## Symptoms

- Staging ingest runs succeed, but `/admin/ingest` in prod stays empty.
- Tier-1 sources are validated but never auto-apply/auto-publish.
- Promotion repeatedly retries or logs validation failures.

## Triage

- Check **prod worker logs** for `promotion.*` and `autopublish.*` events.
- Verify `SYNAC_STAGING_DATABASE_URL` is configured on the **prod worker** (and prod web if manual triggers should target staging).
- Verify staging has enabled + verified sources and that staging ingest runs are completing (`ingest_runs.status=SUCCESS`).
- Confirm prod has the same sources by `source_slug` (promotion maps staging → prod by slug).
- If entry pages are missing expected “Stands for” / “Also known as” data, confirm the staging run produced `proposed_change.variants` and that auto-apply/approve paths are writing to `entry_variants`.

## Mitigation

- Restart/redeploy the **prod worker** to re-run scheduled promotion jobs.
- If validation is failing, inspect the failing run/item in staging and either:
  - disable the offending source temporarily, or
  - tighten validation thresholds / fix adapter output, then retry.
- If prod is missing a source slug, re-sync sources (or create the source in prod, then retry promotion).
