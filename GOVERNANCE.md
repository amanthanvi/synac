# Governance

SynAc is maintained by Aman Thanvi, on a BDFL model.

That means:

- The maintainer makes final decisions on product direction, scope, and releases.
- Contributions are welcome. They are accepted or declined based on safety, scope, and maintainability.

## How decisions happen

1. Open an issue describing the problem and proposed change.
2. Discuss tradeoffs and scope.
3. The maintainer makes a call (approve, request changes, or decline).

If you are unsure whether something fits, start with an issue.

## What requires prior discussion

Please open an issue (and wait for maintainer approval) before starting work that touches:

- `content/sources`
- `content/generated`
- `content/tags.json`
- `content/tag-assignments.json`
- `convex/`
- `tools/`
- `.github/workflows/`
- `apps/web/src/app/api/`
- `apps/web/src/proxy.ts`
- Security posture, rate limiting, or provenance rendering rules
- Content licensing and attribution policy
- CI, release, or deployment automation changes

## Code of Conduct

All project spaces follow `CODE_OF_CONDUCT.md`.

