# Governance

SynAc is maintained by **Aman Thanvi** (BDFL model).

That means:

- The maintainer makes final decisions on product direction, scope, and releases.
- Contributions are welcome, but may be accepted/rejected based on safety, scope, and maintainability.

## How decisions happen

1. Open an issue describing the problem and proposed change.
2. Discuss tradeoffs and scope.
3. The maintainer makes a call (approve, request changes, or decline).

If you’re unsure whether something fits, start with an issue.

## What requires prior discussion

Please open an issue (and wait for maintainer approval) before starting work that touches:

- `packages/db/**` (Prisma, migrations, queries)
- `apps/worker/**` (ingest/promotion jobs)
- `apps/web/src/app/admin/**` (admin UI)
- `apps/web/src/app/api/**` (API routes)
- Security posture, auth, rate limiting, or provenance rendering rules
- Content licensing/attribution policy
- CI, release, or deployment automation changes

## Code of Conduct

All project spaces follow `CODE_OF_CONDUCT.md`.

