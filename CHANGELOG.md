# Changelog

SynAc ships `v0.x` releases. This file tracks user-visible changes.

The website also has an in-app changelog at `/changelog`. That view is curated for the site. This file is the canonical release log for the repository.

## Unreleased

- Vercel Web Analytics counts page views in aggregate, without cookies, with
  the same query-string removal and Global Privacy Control opt-out as Speed
  Insights. The privacy policy lists what Vercel receives.
- Vercel Speed Insights measures page performance (Core Web Vitals). The
  reported page address has its query string removed, so search terms stay out
  of it, and browsers that send Global Privacy Control are not measured. The
  privacy policy lists what Vercel receives.

## v0.2.0 (2026-09-11)

Meanings, provenance, and a public API.

- Senses are grouped into meanings. The compiler merges near-identical
  definitions from different sources into one meaning: the lead source's
  definition is the meaning's text, and every other source's wording renders
  beneath it as an attestation. See `docs/content/senses.md`.
- Editorial labels and disambiguation notes are curated in
  `content/overrides/**` through `labelSenses`, `disambiguationNotes`,
  `groupSenses`, and `splitSenses`. The compiler warns with `needsLabel` when
  two meanings on an entry are alike enough to confuse a reader and neither
  carries a label.
- Search works at meaning level. `/search?scope=senses` and
  `/api/v1/search?scope=senses` match definition text and return one row per
  meaning with a deep link to it.
- Provenance carries more of the source's terms. Each source declares
  `license.contentMode` (QUOTED, SUMMARIZED, PARAPHRASED) and a
  `license.publicStatement` that the site renders next to its attestations.
- Tag assignments record `assignedBy`, so a reader can tell a curated tag from
  a classifier-proposed one.
- Pages are cached with tagged server-side data and revalidated at deploy time.
  The Deploy workflow calls the revalidate endpoint after the content sync, so
  a merge publishes immediately.
- Accessibility work toward WCAG 2.2 AA: the sense table of contents is
  keyboard reachable and correctly linked, headings form one outline, and an
  axe scan runs on every pull request.
- A public read API ships at `/api/v1`, with an OpenAPI document and a paged
  dataset export. The editorial layer is CC BY 4.0; quoted and attested source
  wording stays under its own source's license. See `docs/api.md`.
- Every entry links out to edit it on GitHub or to report a problem with it.
- View tracking was removed. There is no `synac_session` cookie and no view
  endpoint, so the site sets no cookies at all.
- CI gates widened: `convex/` and `tests/convex/` are now linted and
  typechecked, formatting is enforced, and a `Quality` workflow runs the
  Playwright plus axe end-to-end suite and Lighthouse CI on every pull request.

Open content model (GitOps rework).

- Content as code: all glossary content (terms, senses, citations, tags, source
  registry) moved into this repository under `content/`; changes flow through
  pull requests and git history is the audit trail.
- Removed accounts and the private admin surface entirely; the site is fully
  public and anonymous.
- Automated source ingest moved to a scheduled GitHub Actions workflow that
  opens a reviewable pull request when upstream content changes.
- Hardened scheduled ingest timeouts and NIST concurrency, refreshed the Node
  24 toolchain, and cleared high-severity dependency advisories (#206) — thanks
  @amanthanvi.
- Raised the NIST ingest ceiling to cover the complete live glossary index
  (#207) — thanks @amanthanvi.
- Rebuilt the backend on a clean Convex schema with typed relations, a
  validated content-sync pipeline, and service-key-guarded runtime endpoints.
- Repo/community polish (docs, templates, contributor experience).

## v0.1.5 — 2026-02-10

Clinical Reference UI.

- Public UI:
  - Adopted the Clinical Reference visual system: dark-leaning,
    monospace-forward, and documentation-inspired.
  - Stacked entry pages with sticky sense navigation, richer metadata, and
    hover previews.
  - Removed /trending and aligned navigation, sitemap, and public routes to
    the new product direction.
- Design system:
  - Geist Sans + Geist Mono across the public site.
  - System-aware theming with dark/light/system persistence.

## v0.1.4 — 2026-01-09

Reference Atlas UX refinements.

- Search & navigation:
  - Single global header search with `/` focus shortcut.
  - Command palette (`⌘K` / `Ctrl+K`) for navigation + quick search.
- Public UI:
  - Browse + search listings tightened for faster scanning.
  - Entry pages: high-sense accordion + hash-to-sense opening behavior.
- Admin:
  - UI consistency pass for key workflows (entries, ingest review, audit, takedown).

## v0.1.3 — 2026-01-06

Field manual UI overhaul.

- Default light “field manual” theme with automatic dark mode.
- Entry pages: at-a-glance rail, sense TOC, footnote-style references.
- Explore dropdown navigation and refreshed home page.

## v0.1.2 — 2026-01-06

Tier‑1 source expansion.

- Added IETF RFC 4949 Internet Security Glossary ingestion (Tier‑1 source).
- Seeded additional MITRE ATT&CK CTI sources (Mobile + ICS).

## v0.1.1 — 2026-01-06

Branding polish + NICCS glossary ingestion.

- Public UI: navbar brand lockup simplified (single SynAc wordmark).
- Ingest:
  - Added NICCS (CISA) cybersecurity vocabulary ingestion (CSV export).
  - Added NICCS to the seeded Source Registry for staging-first promotion.

## v0.1.0 — 2026-01-02

Initial public release.

- Public browse + search for terms and acronyms.
- Per-sense citations with license notes and attribution.
- Admin surface with Clerk auth + allowlist-gated RBAC.
- Ingest system with validation, review gates, and audit trail.
- Staging-first ingest with automated promotion and Tier‑1 auto-publish.
