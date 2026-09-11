# Triage + labels

SynAc uses a small label set so issues stay searchable and their intent is
obvious. Every label below is applied automatically by an issue form in
`.github/ISSUE_TEMPLATE/`. Blank issues are disabled, so an unlabelled issue
means someone edited the label off. Put it back.

## Labels

| Label           | Applied by                 | Means                                                       |
| --------------- | -------------------------- | ----------------------------------------------------------- |
| `bug`           | `bug_report.yml`           | Something in the product misbehaves.                        |
| `content`       | `content_correction.yml`   | A published definition, example, or citation is wrong.      |
| `enhancement`   | `feature_request.yml`      | A change in product behavior or scope.                      |
| `source`        | `source_request.yml`       | Add or change a Source Registry entry.                      |
| `term-proposal` | `term_proposal.yml`        | Propose a new entry (term or acronym).                      |
| `sense`         | `sense_disambiguation.yml` | Add, split, merge, or relabel a sense on an existing entry. |

Use `good first issue` and `help wanted` on top of these when an issue is a good
on-ramp. That is the whole label set, so resist adding more.

## Triage paths

### `bug`

Confirm a reproduction: URL, steps, expected vs actual, browser if it is a UI
issue. Decide the surface (public web, admin, API, or worker), because that
decides who can send a PR (see `GOVERNANCE.md`). If it is not reproducible,
comment "needs repro" and leave it open for a week.

### `content`

Every content fix needs a citation. Check that the reporter gave an
authoritative source URL and that the source's license permits how the wording
would be used (`docs/content/licensing.md`). Corrections land through the
editorial layer, not by editing the database by hand. See
`docs/content/editorial-layer.md`. If the definition came from an upstream
source and the upstream is wrong, say so in the issue and decide whether SynAc
overrides it.

### `enhancement`

Check it against `SPEC.md` and `ROADMAP.md` before discussing implementation. If
it expands scope, it needs a maintainer decision first; say so and label it
rather than letting an implementation PR arrive unannounced.

### `source`

Route to the Source Registry checklist: license type, allowed use, attribution
requirements, robots policy, access method, and trust tier all have to be
answerable before a source can be enabled (`docs/content/licensing.md`). A
source with unclear licensing stays closed, not pending.

### `term-proposal`

Confirm the headword is not already an entry or a variant of one, that each
proposed sense carries at least one authoritative citation, and that the
proposer said whether the wording is quoted or their own. Then check it against
the taxonomy (term vs acronym, tags, and relationships) in
`docs/content/taxonomy.md`.

### `sense`

These are about _which_ senses exist and how they are labelled, not the wording
of one definition (that is `content`). Confirm the entry URL and the specific
sense fragment (`#s-<slug>`), and that the requested split/merge produces senses
that are actually distinct. Sense structure changes ripple into search and
relationships, so they get a maintainer review.

## Triage workflow

1. Clarify the report:
   - URL, reproduction steps, expected vs actual behavior
   - citations (for `content`, `term-proposal`, and `sense`)
2. Confirm scope:
   - docs and public web changes are usually PR-eligible
   - DB, worker, admin, and API changes require prior maintainer approval (see
     `GOVERNANCE.md`)
3. Add labels + a short status comment:
   - “needs repro”, “needs design decision”, “blocked”, etc.
4. Close with a reason, not silence. Link the PR, the decision, or the duplicate.
