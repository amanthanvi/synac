# Runbook: Ingest published bad content

## Immediate actions

1. Disable the source to stop new ingest.
2. Use audit log + rollback to revert the affected entry revisions.
3. If the issue is licensing/copyright:
   - create a takedown case in `/admin/takedown`
   - mark the SourceDocument do-not-use
   - purge derived content

## Follow-up

- Add or tighten license gate rules.
- Add test fixtures covering the failure mode.
- Check prod worker logs for:
  - `promotion.import_runs.ok`
  - `autopublish.tier1.ok`
  - `autopublish.item_failed`
- If bad content originated from autopublish, inspect:
  - the staging ingest item payload,
  - prod `INGEST_ITEM_AUTO_APPLY` / `ENTRY_PUBLISH` audit events,
  - source-document provenance and do-not-use flags.

