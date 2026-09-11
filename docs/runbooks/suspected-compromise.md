# Runbook: Suspected compromise

Assume the attacker still has access until you have revoked sessions **and**
rotated secrets. Do the containment steps in order.

## Immediate actions

1. **Revoke Clerk sessions.** Rotating the Clerk keys does not, on its own, end
   sessions that are already signed in. In the Clerk Dashboard, open **Users →
   the affected user → Sessions** and revoke that user's active sessions; if the
   blast radius is unclear, revoke sessions for **all** users.
2. **Shrink the admin allowlists.** Remove any account you do not need right now
   from `SYNAC_ADMIN_EMAILS` and `SYNAC_EDITOR_EMAILS`, then redeploy web.
   Admin access is allowlist-gated (`apps/web/src/lib/admin.ts`), so this is the
   fastest way to cut off a compromised account even before key rotation lands.
3. **Rotate secrets** and redeploy the affected services:
   - `CLERK_SECRET_KEY` (and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` if you rotate
     or replace the Clerk instance itself, because it is baked into the client
     bundle, so web must be rebuilt and redeployed).
   - Database credentials (`DATABASE_URL`, and
     `SYNAC_STAGING_DATABASE_URL` if promotion is configured).
   - `SYNAC_RATE_LIMIT_SALT`, the only salt the app requires at boot
     (`apps/web/src/lib/secrets.ts`). Rotating it invalidates the derived
     rate-limit hashes, which is the intended behaviour here.
   - `SYNAC_REVALIDATE_SECRET`, the bearer token for
     `POST /api/v1/internal/revalidate`.
4. **Freeze ingest and publishing.**
   - Scale the `worker` service to **0 replicas** in Railway.
   - Disable sources: Admin → Sources, or
     `POST /api/v1/admin/sources/{id}/disable`.

## Investigation

- Review audit events (`/admin/audit`) for suspicious publishes, rollbacks, tag
  merges, and source changes, and note the actor on each.
- Review deploy logs and access logs around the same window.
- Check whether any secret was exposed in CI logs or a PR.

## Recovery

- Restore from PITR if content or data was altered (see
  `docs/runbooks/db-restore.md`).
- Purge cached pages after any content rollback:

  ```bash
  curl -X POST "$SITE_URL/api/v1/internal/revalidate" \
    -H "Authorization: Bearer $SYNAC_REVALIDATE_SECRET" \
    -H 'Content-Type: application/json' \
    -d '{"tags":["entries","tags","sources","search"]}'
  ```

- Restore the allowlists, scale the worker back up, and re-enable sources only
  after rotation is confirmed complete.

## Follow-up

- Report handling and disclosure follow `SECURITY.md`.
