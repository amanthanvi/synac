# Roadmap

This roadmap is intentionally high-level. Day-to-day planning happens in GitHub
issues.

For the product/spec view, see `SPEC.md`. For the implementation tracker, see
`PLAN.md`. For what shipped, see `CHANGELOG.md`.

## Just delivered (v0.2.0, unreleased)

The "Clinical Reference" UI overhaul plus the 2026-09 audit remediation:

- Senses modelled as **meanings** with per-source attestations, stable
  `#s-<slug>` fragments, and conflict detection that blocks auto-publish.
- **Meaning-level search** (`?scope=senses`) alongside entry search.
- A documented **public read API** and dataset export, with `openapi.json`,
  ETags, and tag-scoped caching plus an authenticated revalidate endpoint.
- Tag governance gained kinds, hierarchy, assignment provenance, and an
  additive-only auto-tagger behind a hit threshold.
- An **editorial layer** (`content/entries/**` YAML) synced by the worker, so
  labels and disambiguation notes are contributable by PR.
- **License gate hardening** and an explicit takedown SLA; auto-publish is now
  opt-in and never fires on a WARN without `SYNAC_AUTOPUBLISH_WARN=true`.
- For privacy, the anonymous `synac_session` cookie, the `entry_views` table
  and `/api/v1/view` are removed.
- New CI gates: e2e plus axe, Lighthouse budgets, coverage, format check,
  Prisma validate, migration drift, version consistency, and SHA-pinned
  actions.

## Now

- Tag `v0.1.5` retroactively. This is a maintainer git action. The repo has
  tags `v0.1.0`, `v0.1.3` and `v0.1.4`, but `v0.1.5` was released without one:
  `git tag -a v0.1.5 <commit> -m "v0.1.5" && git push origin v0.1.5`.
  `pnpm version:check` keeps manifests and `CITATION.cff` honest from here on.
- Cut `v0.2.0`: bump every workspace manifest + `CITATION.cff` together, then
  follow `docs/RELEASING.md`.
- Clear the last two advisory type-aware lint warnings in `apps/worker` so
  `pnpm lint:strict` can become a blocking CI gate.
- Run a one-time `pnpm -r format:write`: `prettier --check` is now part of
  `pnpm gate`, and a large pre-existing backlog does not match the config.

## Next

- Sense-level editorial coverage: labels and disambiguation notes for the
  entries that carry the most conflicting attestations.
- Grow `content/entries/**` and the contributor path around it.
- Coverage thresholds beyond the `packages/db` query layer.
- Admin UI consistency pass (it stayed functional through the v0.2.0 overhaul
  but did not get the redesign).

## Later

- First-class self-hosting docs; `docker-compose.yml` and the Dockerfiles are
  the starting point.
- Additional sources + editorial tooling improvements (issue-driven).
- API stability guarantees beyond "v1 is additive" once external consumers
  exist.
