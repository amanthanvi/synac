# Runbook: Suspected compromise

## Immediate actions

1. Rotate secrets:
   - Clerk keys
   - DB credentials
2. Invalidate sessions / restrict admin:
   - tighten allowlists
   - disable non-essential admin accounts
3. Freeze ingest and publishing.

## Investigation

- Review audit events for suspicious actions.
- Review deploy logs and access logs.

## Recovery

- Restore from PITR if needed (see `db-restore.md`).

