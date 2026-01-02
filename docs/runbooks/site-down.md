# Runbook: Site down

## Triage

1. Confirm symptoms:
   - public pages 5xx? admin 5xx? only search?
2. Check deploy status and recent changes:
   - latest GitHub Actions runs
   - last deploy time
3. Check logs:
   - web runtime errors
   - DB connection errors

## Mitigation

- Roll back the last deploy if correlated.
- If DB is unhealthy, enable read-only mode and/or scale DB.
- If search is the only failing subsystem:
  - temporarily hide search UI and link users to browse routes.

## Follow-up

- Root cause analysis + add regression coverage where possible.

