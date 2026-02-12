# Changelog

SynAc follows a `v0.1.x` release cadence. This file tracks user-visible changes.

Note: the website also has an in-app changelog at `/changelog`. That view is curated for the site, while this file is the repo’s canonical release log.

## Unreleased

- Repo/community polish (docs, templates, contributor experience)

## v0.1.5 — 2026-02-08

Signal Ledger UI overhaul.

- Public UI:
  - New visual system: instrument-panel header over archival paper (dot-grid + grain).
  - Browse listings redesigned as ledger sheets for faster scanning.
  - Entry pages: left-rail layout and restyled sense “evidence cards”.
- Typography:
  - Fraunces display with Instrument Sans + IBM Plex Mono.

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

