# Triage + labels

SynAc uses a small label set to keep issues searchable and to clarify intent.

## Recommended labels

Type labels:

- `type: bug`
- `type: docs`
- `type: ui`
- `type: content`
- `type: question`

Area labels (use sparingly):

- `area: web`
- `area: docs`
- `area: ingest` (issue-only unless maintainer-approved)

Meta labels:

- `good first issue`
- `help wanted`

## Triage workflow

1. Clarify the report:
   - URL, reproduction steps, expected vs actual behavior
   - citations (for content correction issues)
2. Confirm scope:
   - docs and public web changes are usually PR-eligible
   - protected paths require prior maintainer approval: `content/sources`,
     `content/generated`, `content/tags.json`, `content/tag-assignments.json`,
     `convex/`, `tools/`, `.github/workflows/`, `apps/web/src/app/api/`, and
     `apps/web/src/proxy.ts`. See `GOVERNANCE.md` for the full list and the
     approval process.
3. Add labels and a short status comment, such as "needs repro", "needs design
   decision", or "blocked".

