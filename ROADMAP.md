# Roadmap

This roadmap is intentionally high-level. Day-to-day planning happens in GitHub issues.

For the product/spec view, see `SPEC.md`.

## Now

- OSS repo + contributor experience overhaul (docs, templates, governance, hygiene)
- `v0.2.0` is tagged and released.

## What v0.2.0 delivers

- Senses grouped into meanings, with a per-source attestation under each meaning and editorial labels to tell the meanings apart.
- Search at meaning level, not just entry level.
- Provenance carrying each source's content mode (quoted, summarized, paraphrased) and its public license statement.
- Tag provenance: every tag link records what assigned it.
- Server-rendered pages served from a tagged cache that the deploy workflow revalidates as soon as the content sync finishes.
- Accessibility fixes on the public site, working toward WCAG 2.2 AA.
- A public read API and a paged dataset export (`docs/api.md`).
- End-to-end and Lighthouse gates running in CI on every pull request.

## Next

- Expand the contributor “safe surface” with more test coverage and clearer guardrails

## Later

- First-class self-hosting docs (Docker Compose) if there’s demand
- Additional sources + editorial tooling improvements (issue-driven)

