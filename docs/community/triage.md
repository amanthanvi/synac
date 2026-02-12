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
   - docs/public web changes are usually PR-eligible
   - DB/worker/admin/API changes require prior maintainer approval (see `GOVERNANCE.md`)
3. Add labels + a short status comment:
   - “needs repro”, “needs design decision”, “blocked”, etc.

