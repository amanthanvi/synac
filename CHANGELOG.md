# Changelog

SynAc tracks user-visible changes here. The current line is `v0.2.x`.

Note: the website also has an in-app changelog at `/changelog`. That view is curated for the site, while this file is the repo’s canonical release log.

## v0.2.0 (2026-09-10)

This release has two parts: the "Clinical Reference" UI overhaul and the
2026-09 audit remediation.

### "Clinical Reference" public UI overhaul

- New design system. The look is monospace-forward and dark-leaning, in the
  style of developer documentation: Geist Sans and Geist Mono, a cool blue-gray
  palette with electric accents, no warm tones, and no paper or grain textures.
- The theme follows the system setting by default, with a manual toggle
  persisted in `localStorage`.
- Unified page shell. Every public page uses one container width, one header
  rhythm, and one content cadence.
- Flattened navigation (Terms, Acronyms, Tags, Sources, About); the Explore
  dropdown and the Trending page are gone.
- Typographic wordmark; the shield mark is retired.
- Deliberate motion (page-load stagger, smooth accordions, hover
  micro-interactions) with full `prefers-reduced-motion` support.
- Mobile treated as an equal target, not an afterthought.

### Content model stores meanings, not blobs

- **Senses are meanings.** Each sense has a stable slug and its own fragment
  link (`#s-<slug>`).
- **Per-source attestations.** `sense_definitions` records how each source
  words a given meaning, so several sources can attest the same sense and
  disagreements stay visible instead of being flattened.
- Conflicting attestations set `needsLabel` and **block auto-publish** until a
  human writes a disambiguating label.
- **Meaning-level search.** Search can be scoped to senses
  (`/api/v1/search?scope=senses`), so a query lands on the meaning that
  matches rather than on the entry that happens to contain the word.
- **Tag governance.** Tags now have a kind (`DOMAIN` / `FACET`), a parent
  hierarchy, and per-assignment provenance (`EDITORIAL` / `AUTO` / `INGEST`).
  Auto-tagging is additive-only behind a hit threshold and can never remove an
  editorial assignment. See `docs/content/taxonomy.md`.
- **Editorial layer.** Sense labels, disambiguation notes, confusions and tag
  assignments can be contributed as YAML under `content/entries/**`, applied
  by the worker's `editorial_sync` job. See `docs/content/editorial-layer.md`.

### Public read API + dataset

- New public, documented read API under `/api/v1` (entries, terms, acronyms,
  tags, sources, per-sense citations, sense-scoped search) with a
  machine-readable `openapi.json`. See `docs/api.md`.
- Dataset export (`/api/v1/export/entries.json`, `.csv`) with an explicit
  license split: the editorial layer is CC BY 4.0; third-party source content
  keeps its own license and attribution requirements.
- `GET /api/healthz` for platform and CI health checks.

### Caching

- Public pages render dynamically over tag-scoped `unstable_cache` loaders
  (`entries`, `tags`, `sources`, `search`).
- `POST /api/v1/internal/revalidate` (Bearer `SYNAC_REVALIDATE_SECRET`) purges
  by tag, so a content change is visible without a redeploy.
- Read API responses carry ETags and answer `If-None-Match` with 304.

### Licensing + safety

- License gate hardened: an explicit license-type → PASS/WARN/FAIL mapping,
  quoted content from non-permissive sources escalated, and stale (>180 day)
  license verification downgraded to WARN. A WARN never auto-publishes unless
  `SYNAC_AUTOPUBLISH_WARN=true`; `SYNAC_AUTOPUBLISH_TIER1` now defaults to
  **false**. See `docs/content/licensing.md`.
- Published takedown SLA: acknowledge within 3 business days, resolve within 7.

### Privacy

- **The anonymous `synac_session` cookie is gone**, along with the
  `entry_views` table and the `/api/v1/view` endpoint. SynAc no longer tracks
  individual reads.
- Client identifiers used for rate limiting and audit are salted and hashed
  (`SYNAC_RATE_LIMIT_SALT`); proxy depth is
  explicit via `SYNAC_TRUSTED_PROXY_HOPS`.

### CI + repo hygiene

- New `quality.yml`: Playwright end-to-end tests with axe accessibility
  assertions on the key public pages, plus Lighthouse CI budgets
  (performance ≥ 0.85, accessibility ≥ 0.95, LCP ≤ 2.5s, CLS ≤ 0.1,
  TBT ≤ 300ms).
- CI also enforces `prettier --check`, Prisma schema validation, a
  **migration drift check** against an empty shadow database, and version
  consistency across every workspace manifest and `CITATION.cff`
  (`pnpm version:check`).
- Coverage job with uploaded `coverage/` artifacts and thresholds on the
  `packages/db` query layer.
- Type-aware ESLint (`recommendedTypeChecked`) with the documented
  "no TS suppression" rule now actually enforced
  (`ban-ts-comment`, `no-explicit-any`, `no-floating-promises`).
- Stricter TypeScript: `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`.
- Every GitHub Action pinned by commit SHA; CodeQL runs `security-extended`;
  SBOM generated with `cdxgen` (pnpm-aware); Dependabot groups minor/patch
  updates weekly.
- `docker-compose.yml` + `Dockerfile.web` / `Dockerfile.worker` for a
  one-command local Postgres (and optional full stack); Railway deploys gain a
  `/api/healthz` health check and a restart policy.
- New issue templates (term proposal, sense disambiguation), an accessibility
  and provenance checklist in the PR template, and a broadened `CODEOWNERS`.

## v0.1.5 — 2026-02-08

Signal Ledger UI overhaul. **Superseded by the "Clinical Reference" overhaul in
v0.2.0.** The visual system described below no longer ships.

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
