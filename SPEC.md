# SynAc v0.1.0 — Production Specification (SPEC.md)

SynAc is a public, internet-facing cybersecurity dictionary/glossary/handbook that centralizes, normalizes, curates, and presents high-quality security terminology and acronyms with strong provenance and attribution. v0.1.0 is a real public launch (not a prototype): it includes robust ingest/scraping as a first-class system (legal/compliance gates, SSRF-safe acquisition, provenance per field, human review workflows), a fast SEO-friendly browsing/search experience, and production operations (security hardening, observability, backups, incident readiness).

---

## 2) Goals and Non-goals

### Goals (v0.1.0)

-   Provide a high-quality, searchable, browsable cybersecurity glossary with **terms and acronyms as first-class entities**, supporting multiple meanings and disambiguation.
-   Treat ingest/scraping as a core subsystem:
    -   registry of sources with license notes and attribution requirements,
    -   safe acquisition (SSRF-resistant, sandboxed parsing),
    -   normalization, dedupe/entity resolution, conflict handling,
    -   provenance tracking per field,
    -   human review and auditability,
    -   takedown/removal workflow.
-   Launch with production-level security, reliability, observability, and operational controls.
-   Ensure SEO, accessibility (WCAG 2.2 AA), and high performance (Core Web Vitals targets).

### Non-goals (explicitly out of scope for v0.1.0)

-   User-generated content (public submissions, comments, community edits).
-   End-user accounts/profiles, saved lists, personalization, notifications.
-   Paid subscriptions, paywalls, ads, affiliate monetization.
-   Full multi-language localization (i18n); English-only for v0.1.0 (see Open Questions).
-   “Real-time threat intel” feeds or automated security alerts.
-   Full offline mobile app.
-   Multi-tenant SaaS with customer workspaces (explicitly non-goal; see Security section for future considerations).

---

## 3) Assumptions

1. SynAc will **not** rely on creating definitions from scratch; it will primarily ingest and curate from reputable sources, with editorial additions where necessary.
2. SynAc will maintain **clear provenance**: each definition/example/reference can be traced back to source URL/document and timestamp.
3. SynAc will be operated by a **solo operator** (1 person wearing all hats: dev, editor, admin) for v0.1.0.
4. There will be **no public login**; only internal admin/editor access.
5. A relational database (PostgreSQL) is acceptable as the system of record.
6. Ingest runs will occur at most **daily** per source initially, with manual triggers for urgent refreshes.
7. Licenses for sources vary; **license compatibility must be verified** per source before publishing derived/copied content.
8. SynAc must be safe under hostile internet conditions (bots, scraping, abuse, malicious PDFs/HTML, credential stuffing attempts on admin).
9. v0.1.0 will target a corpus size on the order of **10k–200k senses** (definitions/meanings), with growth over time (scalability described in NFRs).
10. “Trending” in v0.1.0 will be computed from privacy-aware aggregated page views (no invasive tracking).

---

## 4) Personas & Primary User Journeys

### Persona A: Anonymous Visitor (Public)

**Goals**

-   Quickly understand a cybersecurity term/acronym.
-   Distinguish multiple meanings (e.g., “SAML”, “SOC”).
-   Trust the content via references and provenance.
-   Discover related concepts.

**Journeys**

1. Search “SAML” → see disambiguation → select the correct meaning → read definition + references → explore related terms.
2. Browse by letter/tag (e.g., “Zero Trust”, “Identity”) → scan concise summaries → open entry pages.
3. Land from Google on an entry page → see canonical title, definition, citations, last updated → continue via “See also”.

### Persona B: Maintainer/Editor (Admin)

**Goals**

-   Add/edit/publish entries safely with audit trail.
-   Review ingest suggestions and resolve conflicts.
-   Enforce quality/consistency rules.
-   Handle takedown requests and source policy changes.

**Journeys**

1. Run ingest for a source → review queued changes → approve/publish selected items → verify attribution display.
2. Edit an entry to add clarification → preview → publish → confirm changelog/audit event.
3. Receive takedown request → disable source or remove specific content → purge derived items → leave tombstone/redirect.

---

## 5) Functional Requirements (v0.1.0)

> **Definitions**

-   **Entry**: a concept page (term or acronym) with one or more **Senses** (meanings/definitions).
-   **Sense**: a specific meaning/definition, potentially with examples, notes, references, and provenance.
-   **Variant/Alias**: alternate spellings, abbreviations, synonyms used for search and redirects.

### FR-001 — Public site availability and basic navigation

**Requirement**

-   Provide a public website with home, browse, search, and entry pages accessible without login.

**Acceptance Criteria**

-   Anonymous users can access `/`, `/terms`, `/acronyms`, `/search`, and entry pages without authentication.
-   `/admin/*` requires authentication (see Security & Auth).

---

### FR-002 — Entry data model: required fields and rendering

**Requirement**

-   Each Entry must support consistent, structured fields and render in a readable, scannable format.

**Minimum Entry fields (system-of-record)**

-   `entry_type`: `TERM` | `ACRONYM`
-   `display_title`: canonical display name (e.g., “Security Operations Center” or “SAML”)
-   `primary_slug`: URL-safe canonical slug
-   `status`: `DRAFT` | `PUBLISHED` | `ARCHIVED`
-   `summary`: 1–2 sentence short definition (required for published)
-   `tags`: zero or more tags/categories
-   `created_at`, `updated_at`, `published_at`
-   `editorial_notes` (internal-only)

**Acceptance Criteria**

-   Published entries always show: title, entry type badge, summary, senses list, references/citations, last updated date, and attribution.
-   Draft entries are not publicly accessible (404 or 403, configurable; default 404).

---

### FR-003 — Senses (multiple meanings) and disambiguation

**Requirement**

-   Support multiple Senses per Entry with explicit disambiguation and ordering.

**Sense fields**

-   `sense_id`
-   `sense_label` (e.g., "Identity standard", "Team/organization", optional)
-   `definition` (Markdown, sanitized; required for published senses)
-   `expanded_form` (for acronyms; optional per sense, but recommended)
-   `examples` (0..n; Markdown)
-   `common_confusions` (0..n links to other entries)
-   `warnings/notes` (e.g., deprecated term; vendor-specific usage)
-   `origin_language` (for i18n metadata; e.g., "en", "de"; optional)
-   `temporal_context` (era/date range; e.g., "1990s", "pre-2010"; optional)
-   `provenance` pointers per field (see ingest/provenance requirements)

**Acceptance Criteria**

-   If an acronym has >1 published sense, the entry page shows a “Meanings” section at top with anchor links.
-   Each sense can be directly linked via fragment (`/acronym/soc#sense-<sense_id>`) and has a stable ID (UUID; not dependent on ordering).
-   Editors can reorder senses; the first sense is treated as “primary” for snippets.

---

### FR-004 — Acronyms and expansions as first-class

**Requirement**

-   Acronyms must support expansions, multiple meanings, and ambiguity resolution across sources.

**Acceptance Criteria**

-   Acronym pages display expansions prominently per sense.
-   Search for an expansion phrase (e.g., “security operations center”) returns the acronym entry (SOC) and the term entry if one exists.
-   Acronyms can include punctuation variants (e.g., “C2”, “C&C”) and are normalized for search.

---

### FR-005 — Canonical URL, slug behavior, and slug history

**Requirement**

-   Entries have canonical URLs and preserve old slugs with redirects.

**URL rules**

-   Term canonical: `/term/{slug}`
-   Acronym canonical: `/acronym/{slug}` (slug generally uppercase in display but lowercase slug in URL; e.g., `/acronym/saml`)
-   Tags: `/tags/{tag-slug}`
-   Sources: `/sources` and `/sources/{source-slug}`

**Acceptance Criteria**

-   Changing an entry slug creates a slug-history record and old URL returns a permanent redirect (`308`) to the new canonical URL.
-   Canonical `<link rel="canonical">` is present on entry pages.
-   Slugs are unique within entry type; conflicts resolved via suffix (`-2`, `-3`) and editor prompt.

---

### FR-006 — Entry relationships (“Related terms”, hierarchy, confusion)

**Requirement**

-   Support a relationship graph for discovery and correctness.

**Relationship types**

-   `RELATED`
-   `BROADER_THAN` / `NARROWER_THAN`
-   `OFTEN_CONFUSED_WITH`
-   `SEE_ALSO`

**Acceptance Criteria**

-   Entry page shows “Related” and “See also” blocks with up to N (default 10) relationships, prioritized by editorial weight + relevance.
-   Relationships are bidirectional where appropriate (e.g., RELATED), enforced by constraints.

---

### FR-007 — Tags and categories

**Requirement**

-   Support tagging entries with curated tags/categories for browsing and filtering.

**Acceptance Criteria**

-   `/tags/{tag}` lists entries with pagination and filters by entry type.
-   Admin can create/rename/merge tags with slug history and redirects.

---

### FR-008 — Browse and discovery pages

**Requirement**

-   Provide multiple discovery mechanisms.

**Browse features**

-   Alphabetical index (A–Z, 0–9) for terms and acronyms.
-   “Recently updated” list.
-   “Trending” list (privacy-aware aggregate).
-   Tag browsing and filter chips.

**Acceptance Criteria**

-   `/terms?letter=A` returns term entries starting with “A” (normalized).
-   `/recent` shows last updated published entries (with timestamps).
-   `/trending` uses last 7 days aggregated page views (no per-user profiling).

---

### FR-009 — Search: query handling, ranking, and edge cases

**Requirement**

-   Provide a fast, relevant search experience with typo tolerance policy and deterministic behavior.

**Search features**

-   Single search box on all pages (header).
-   Supports:
    -   exact match (case-insensitive),
    -   prefix match,
    -   acronym expansion match,
    -   alias/synonym match,
    -   tag match (secondary),
    -   fuzzy/typo tolerance (bounded; see policy below).
-   Highlight matched terms in results snippet.

**Typo tolerance policy (default)**

-   Use trigram similarity / edit-distance-like matching only when:
    -   query length ≥ 4,
    -   and exact/prefix yields < 10 results.
-   Never return fuzzy matches above exact matches.
-   Reject or down-rank extremely broad/short queries (`a`, `an`, `the`) and show browse suggestions.

**Acceptance Criteria**

-   `SOC` returns acronym entry first; `security operations` returns SOC near top.
-   Misspelling “authenitcation” still returns “Authentication” within top 5 (given it exists).
-   Empty query shows helpful state (popular searches, browse links) and does not error.
-   Search responses P95 latency ≤ 200 ms at app tier under normal load (see NFR).

---

### FR-010 — Search results UI

**Requirement**

-   Results must be scannable and disambiguate multiple senses.

**Acceptance Criteria**

-   Each result shows: title, entry type, short summary, and (if acronym with multiple meanings) sense labels/excerpts.
-   Pagination or infinite scroll with accessible controls.
-   “No results” state suggests:
    -   spelling check,
    -   related tags,
    -   browsing by letter,
    -   reporting missing term (internal-only for v0.1.0; see Non-goals).

---

### FR-011 — References/citations and provenance display

**Requirement**

-   Every published sense must display its references and attribution requirements.

**Acceptance Criteria**

-   Each sense shows a “References” section with:
    -   source name,
    -   document title (if known),
    -   URL,
    -   accessed/ingested date,
    -   license note (as recorded),
    -   whether text is quoted vs summarized (if applicable).
-   A “Provenance” drawer/modal exists for editors (and optionally public) showing per-field provenance pointers (URL + timestamp + extraction method).
-   `/sources` lists all sources with license notes and last verified date (must be verified).

---

### FR-012 — Editorial workflow: create/edit/publish with drafts

**Requirement**

-   Provide an admin/editor UI to create and manage entries safely.

**Acceptance Criteria**

-   Roles: `ADMIN`, `EDITOR`, `VIEWER` (internal).
-   Editors can:
    -   create draft entries,
    -   edit fields and senses,
    -   preview,
    -   submit for publish (if approval required).
-   Admins can publish/unpublish/archive and manage sources/ingest.
-   Published content changes create audit events and can be rolled back (see FR-014).

---

### FR-013 — Review workflow for ingest suggestions

**Requirement**

-   Ingested changes must route through review gates based on source trust and license.

**Acceptance Criteria**

-   Ingest creates a queue of proposed Entry/Sense changes with diff view.
-   Items show:
    -   extracted text,
    -   normalized output,
    -   source/license metadata,
    -   confidence score,
    -   conflicts detected.
-   Editor can approve, edit before publishing, or reject with reason.
-   Auto-publish is disabled by default; may be enabled per source only after explicit configuration (see ingest requirements).

---

### FR-014 — Audit trail and rollback

**Requirement**

-   Every admin/editor change must be auditable and reversible.

**Acceptance Criteria**

-   Each publish event records:
    -   actor,
    -   timestamp,
    -   changed fields (before/after),
    -   reason (optional),
    -   related ingest run/item (if applicable).
-   Rollback can restore an Entry to any previous published revision within retention window (default: indefinite for metadata; content revisions at least 1 year).

---

### FR-015 — Content quality safeguards (lint rules, duplicates, style)

**Requirement**

-   Enforce content quality through automated validation and editor tooling.

**Quality rules (minimum)**

-   Required for publishing:
    -   summary present,
    -   at least one published sense with definition,
    -   at least one reference/citation per sense (unless explicitly marked “Editorial” with rationale).
-   Markdown restrictions:
    -   no raw HTML,
    -   only allowlists: emphasis, lists, code, links, blockquotes.
-   Duplicate detection:
    -   same normalized title + type,
    -   near-duplicate summary/definition similarity threshold,
    -   acronym collision detection (same acronym different senses allowed; duplicate senses flagged).

**Acceptance Criteria**

-   Publishing fails with actionable errors if rules violated.
-   Duplicate warnings appear during draft creation and ingest review.
-   A “style lint” report is shown in admin UI (e.g., overly long sentences, missing period, vendor marketing tone).

---

### FR-016 — Error/empty states and 404 behavior

**Requirement**

-   Provide user-friendly, secure error handling.

**Acceptance Criteria**

-   404 page provides search box + popular tags + browse links; does not leak internal IDs.
-   500 page shows generic message with a support ID (request_id / error digest); errors captured in monitoring.
-   Empty states (no tags, no results, no trending yet) show helpful guidance without broken UI.

---

## 6) Ingest & Scraping System (FIRST-CLASS; v0.1.0)

### Overview

Ingest is a pipeline that acquires documents from registered sources, parses and normalizes content into structured entries/senses, resolves duplicates/conflicts, applies license/compliance gates, and routes changes through human review before publication (default). It must be operationally safe (SSRF-resistant, sandboxed parsing, timeouts, size limits) and legally defensible (source registry, attribution, takedown workflow).

### FR-100 — Source Registry (authoritative catalog)

**Requirement**

-   Maintain a Source Registry as a first-class entity.

**Each Source must include**

-   `name`
-   `source_slug`
-   `base_url`
-   `license_type` (enum + freeform notes) — **must be verified**
-   `allowed_use` notes (copy/quote/summarize/paraphrase restrictions) — **must be verified**
-   `attribution_requirements` (how to attribute; text/templates)
-   `access_method`: `API` | `RSS` | `HTML` | `PDF` | `OTHER`
-   `robots_policy`: `RESPECT` (default) | `EXPLICIT_PERMISSION` (requires documented approval)
-   `rate_limit_policy` (requests/min, concurrency)
-   `contact` (email/form URL)
-   `last_verified_at` (manual)
-   `trust_tier`: `TIER_1`..`TIER_4` (see governance)
-   `enabled` flag
-   `notes_internal`

**Acceptance Criteria**

-   No ingest run can start for a source missing `license_type`, `allowed_use`, and `attribution_requirements`.
-   `/sources/{source}` public page shows: name, base URL, license notes, attribution statement, last verified date (must be verified), and contact.

---

### FR-101 — Acquisition methods (API/RSS/HTML/PDF) with default approach

**Requirement**

-   Support multiple acquisition methods; default to the least fragile/most compliant method.

**Default approach**

1. Prefer official API/RSS feeds when available and permitted.
2. If no API/RSS: HTML fetch + parse using a stable selector strategy.
3. PDF parsing only when necessary; prefer text-based PDFs over scanned images.

**Acceptance Criteria**

-   Each Source has an explicit configured acquisition method; ingest refuses ambiguous configuration.
-   HTML acquisition stores the final fetched URL and HTTP metadata (status, content-type, content-length, ETag/Last-Modified if present).

---

### FR-102 — Scheduling and triggers (manual + cron)

**Requirement**

-   Provide scheduled ingest and manual on-demand runs.

**Acceptance Criteria**

-   Admin can trigger ingest for a source or all sources from admin UI and API.
-   Cron schedules are configurable per source (default daily off-peak) and stored on the Source record (e.g., `sources.cron_schedule`, UTC).
-   Ingest supports incremental updates using ETag/Last-Modified or content hashing; full reprocessing can be triggered.

---

### FR-103 — Pipeline stages: extract → normalize → dedupe → enrich → validate

**Requirement**

-   Implement a deterministic ingest pipeline with stage outputs stored for audit/debug.

**Stage details**

-   Extract: fetch document(s), store metadata and (if allowed) snapshots.
-   Normalize: convert to internal schema (Entry/Sense/Tag/Citation).
-   Dedupe/entity resolution: match to existing entries via title/acronym/aliases + similarity.
-   Enrich: add inferred tags, related terms (low confidence; review-gated), acronym expansions, link normalization.
-   Validate: apply quality rules and compliance gates.

**Acceptance Criteria**

-   Each IngestItem has a stage status and error detail.
-   Editors can view extracted raw text/snippets used for definitions (within license constraints).

---

### FR-104 — Provenance per field

**Requirement**

-   Track provenance at field granularity (definition, summary, example, expansion, relationships).

**Acceptance Criteria**

-   For each field, store:
    -   source_id, source_document_id,
    -   original URL,
    -   extracted_at timestamp,
    -   extractor version,
    -   byte/line offsets or selector info where feasible,
    -   whether content is QUOTED vs SUMMARIZED vs PARAPHRASED.
-   Public pages show citations; admin UI can drill down to per-field provenance.

---

### FR-105 — Human review gates and auto-publish policy

**Requirement**

-   Gate publication based on trust tier and license policy.

**Default policy**

-   **No auto-publish** in v0.1.0 unless explicitly enabled per source and content type.
-   Auto-publish may be enabled only for:
    -   Tier 1 sources,
    -   license-compatible content,
    -   low-risk fields (e.g., tags, aliases) or pre-approved templates,
    -   with sampling audit (e.g., 1 of every N changes reviewed).

**Acceptance Criteria**

-   System prevents auto-publish when `license_gate` fails or trust tier < configured minimum.
-   Editors can configure per-source: which fields can auto-apply, and max changes per run.

---

### FR-106 — Dedupe + entity resolution

**Requirement**

-   Identify when multiple sources refer to the same entry/sense and merge safely.

**Acceptance Criteria**

-   Entity resolution uses:
    -   exact normalized title/acronym match,
    -   alias match,
    -   trigram similarity,
    -   optional curated mapping overrides.
-   Confident matches auto-merge into a single Entry with multiple citations.
-   Uncertain matches route to editor with side-by-side diff and merge tools.

---

### FR-107 — Conflict handling and “disputed/alternate definitions”

**Requirement**

-   Support multiple definitions when sources disagree, while maintaining clarity.

**Rules**

-   Multiple senses may represent:
    -   distinct meanings, or
    -   disputed definitions for the same meaning.
-   Store source trust rank and allow an editor-defined “preferred” sense.
-   Display alternates with labels and citations; avoid presenting conflicts as facts.

**Acceptance Criteria**

-   When conflicts detected (high similarity title but divergent definitions), ingest flags the item and blocks auto-apply.
-   Entry page can show “Alternate definitions” with source attribution.

---

### FR-108 — Safety controls for acquisition and parsing (SSRF, sandboxing, limits)

**Requirement**

-   Ingest must be hardened against SSRF and malicious content.

**Safety controls (minimum)**

-   Allowlist source domains from Source Registry; block all others.
-   DNS resolution checks:
    -   block RFC1918, link-local, loopback, multicast, IPv6 local ranges,
    -   block `.local` and internal hostnames.
-   Enforce:
    -   max redirects (default 3),
    -   connect timeout (3s), read timeout (15s) configurable,
    -   max response size (default 5 MB HTML, 20 MB PDF; configurable),
    -   content-type allowlist (text/html, application/json, application/xml, application/pdf),
    -   TLS required; validate certificates.
-   Parsing sandbox:
    -   PDF parsing in separate worker process/container with restricted privileges.
-   Malware scanning for stored artifacts (where feasible) and decompression bomb detection.

**Acceptance Criteria**

-   Attempts to ingest from non-allowlisted domain fail with a logged security event.
-   Ingest cannot access `169.254.169.254` or private IP ranges (verified by tests).
-   Oversized responses are aborted and marked failed without OOM or worker crash.

---

### FR-109 — Legal & compliance gating before publish

**Requirement**

-   Publishing must be blocked unless license/use is compatible with SynAc policy.

**Acceptance Criteria**

-   Each proposed change receives a `license_gate` result: PASS/WARN/FAIL with reason.
-   FAIL blocks publishing and requires admin override with recorded justification (default: no overrides allowed; configurable).
-   The system records “last verified” date for each source and warns when stale (e.g., > 180 days).

---

### FR-110 — Attribution output requirements

**Requirement**

-   Attribution must be displayed according to source requirements.

**Acceptance Criteria**

-   Each sense includes citations; citations include:
    -   source name,
    -   URL,
    -   license note,
    -   “Used under …” or required attribution text template.
-   `/sources` includes an attribution directory with per-source statements.
-   If a source requires share-alike or specific notice, the site must display it where required (must be verified).

---

### FR-111 — Takedown / removal workflow

**Requirement**

-   Provide a process to remove content and/or disable sources promptly.

**Acceptance Criteria**

-   Admin can:
    -   disable a source (stops future ingest),
    -   mark specific SourceDocuments as “do not use”,
    -   purge derived fields/senses/entries (soft delete by default; hard delete when legally required).
-   Public pages for removed entries return:
    -   404 Not Found (default) if permanently removed (SynAc does not publicly distinguish “gone” vs “missing” in v0.1.0),
    -   or 308 to replacement entry when merged/renamed.
-   Takedown requests create an internal case record with timestamps, actions taken, and affected content list.

---

## 7) Non-functional Requirements (v0.1.0)

### Security

-   **NFR-001 (OWASP alignment):** Implement OWASP ASVS L2-inspired controls for a public app with admin surface. Security review checklist must be completed before launch.
-   **NFR-002 (Transport security):** Enforce HTTPS; HSTS `max-age>=15552000` (180d) with includeSubDomains; TLS configs per modern baseline.
-   **NFR-003 (Security headers):** CSP (script-src restricted), X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors via CSP; no legacy X-Frame-Options dependency.
-   **NFR-004 (Admin protection):** Admin endpoints require AuthN/AuthZ, MFA at IdP, IP allowlisting optional, rate limits, and audit logging.
-   **NFR-005 (Ingest isolation):** Ingest workers run with least privilege; no access to internal networks; egress restricted to allowlist; secrets scoped.

### Performance

-   **NFR-006 (Core Web Vitals):**
    -   LCP ≤ 2.5s (p75 mobile), CLS ≤ 0.1, INP ≤ 200ms (p75).
-   **NFR-007 (Caching):**
    -   CDN caching for public GET pages with revalidation strategy (ISR/SSG).
    -   API responses cached where safe (public read endpoints) with short TTL (e.g., 60s) and ETags.
-   **NFR-008 (Search latency):** Search P95 ≤ 200ms at app tier under normal traffic; P99 ≤ 500ms.

### Reliability/Availability

-   **NFR-009 (SLO):** Public site monthly availability ≥ 99.9% (excluding scheduled maintenance announced in advance).
-   **NFR-010 (Error rate):** 5xx rate ≤ 0.1% of requests (rolling 30m) excluding deliberate 429/403.
-   **NFR-011 (Graceful degradation):** If ingest/search subsystem fails, core browsing and cached pages remain available.

### Scalability assumptions

-   **NFR-012:** Support:
    -   1M page views/month,
    -   50 RPS sustained, 200 RPS burst (cached),
    -   200k senses, 1M citations,
    -   50 sources, daily ingest with up to 10k changes/day.
-   **NFR-013:** Horizontal scaling supported for web tier and workers; DB remains single primary with read replicas optional.

### Accessibility

-   **NFR-014:** WCAG 2.2 AA compliance for public pages and admin UI critical paths (search, entry view, publish).
-   **NFR-015:** Keyboard navigation for all interactive elements; visible focus states; skip-to-content link.

### SEO

-   **NFR-016:** Generate XML sitemaps (index + per-type), robots.txt, canonical tags, structured data (JSON-LD where appropriate).
-   **NFR-017:** All entry pages have unique title/meta description; avoid duplicate content via canonicalization and redirects.

### Privacy & compliance

-   **NFR-018 (Data minimization):** No third-party invasive tracking by default; collect minimal analytics (see Analytics).
-   **NFR-019 (Log retention):** Default retention 30 days for access logs; 90 days for security/audit logs; must be configurable.
-   **NFR-020 (PII):** Do not store search queries with IP addresses together; anonymize or avoid storing raw queries (policy in Analytics).

---

## 8) Information Architecture & UX Requirements

### Key pages/routes

-   Public:
    -   `/` (home)
    -   `/search?q=...`
    -   `/terms` (browse terms)
    -   `/terms?letter=A`
    -   `/acronyms`
    -   `/acronyms?letter=S`
    -   `/term/{slug}`
    -   `/acronym/{slug}`
    -   `/tags`
    -   `/tags/{tag-slug}`
    -   `/recent`
    -   `/trending`
    -   `/sources`
    -   `/sources/{source-slug}`
    -   `/about` (mission + attribution philosophy + takedown contact)
    -   `/legal` (policies: privacy/cookies/takedown)
    -   `/changelog` (recent additions/updates with RSS feed)
-   Admin:
    -   `/admin` (dashboard)
    -   `/admin/entries`
    -   `/admin/entries/{id}`
    -   `/admin/ingest`
    -   `/admin/ingest/runs/{id}`
    -   `/admin/sources`
    -   `/admin/tags`
    -   `/admin/takedown`
    -   `/admin/audit`

### Navigation model

-   Global header:
    -   logo → home,
    -   search bar,
    -   browse dropdown (Terms, Acronyms, Tags),
    -   Sources,
    -   About.
-   Entry pages:
    -   sticky table of contents for senses (if >1),
    -   “Related / See also” sidebar,
    -   references at end of each sense.

### Content design rules

-   Summary: 1–2 sentences, neutral tone, no marketing.
-   Definition: concise, present tense; define the term without circularity where possible.
-   Examples: short, practical, clearly labeled; avoid sensitive real credentials/data.
-   Warnings/notes:
    -   “Deprecated” labels,
    -   “Vendor-specific” labels,
    -   “Often confused with” list.
-   “Common confusion” section should link to other entries and explain difference in 1–2 sentences.

### Accessibility + UX patterns

-   Search:
    -   autocomplete suggestions are optional; if included, must be ARIA-compliant.
    -   keyboard: up/down to navigate suggestions, enter to select.
-   Filters:
    -   tag filters are checkboxes with clear labels,
    -   persistent in URL query params,
    -   “clear all” control.
-   Content:
    -   headings are hierarchical,
    -   citations are accessible links with descriptive text.

---

## 9) Data Model (Authoritative)

> **Database:** PostgreSQL 16+ (or compatible managed Postgres).  
> **IDs:** UUID (v7 preferred) for primary keys.  
> **Soft delete:** Use `deleted_at` for most content; hard delete only for legal/takedown necessities.

### Core tables (relational schema)

#### `entries`

-   `id` (PK, UUID)
-   `entry_type` (ENUM: TERM, ACRONYM)
-   `display_title` (TEXT, required)
-   `normalized_title` (TEXT, required; for matching)
-   `primary_slug` (TEXT, required)
-   `status` (ENUM: DRAFT, PUBLISHED, ARCHIVED)
-   `summary_md` (TEXT, required for published)
-   `summary_text` (TEXT, generated/plaintext for search snippets)
-   `created_at`, `updated_at`, `published_at`
-   `created_by_user_id` (FK users)
-   `updated_by_user_id` (FK users)
-   `deleted_at` (nullable)
-   Indexes/constraints:
    -   UNIQUE (`entry_type`, `primary_slug`) WHERE `deleted_at IS NULL`
    -   UNIQUE (`entry_type`, `normalized_title`) WHERE `deleted_at IS NULL` (may be relaxed with suffix policy; if relaxed, enforce at app layer + “collision” table)

#### `entry_slug_history`

-   `id` (PK)
-   `entry_id` (FK entries)
-   `slug` (TEXT)
-   `created_at`
-   UNIQUE (`entry_id`, `slug`)
-   UNIQUE (`entry_type`, `slug`) via denormalized `entry_type` or join-enforced app logic
-   Purpose: permanent redirects (308) + canonicalization

#### `entry_variants` (aliases/synonyms)

-   `id` (PK)
-   `entry_id` (FK)
-   `variant_text` (TEXT)
-   `normalized_variant` (TEXT)
-   `variant_type` (ENUM: ALIAS, SYNONYM, ABBREVIATION, MISSPELLING)
-   `created_at`
-   UNIQUE (`entry_id`, `normalized_variant`, `variant_type`)

#### `senses`

-   `id` (PK)
-   `entry_id` (FK)
-   `sense_order` (INT, required)
-   `sense_label` (TEXT nullable)
-   `definition_md` (TEXT, required for published senses)
-   `definition_text` (TEXT, derived)
-   `expanded_form` (TEXT nullable) — important for acronyms
-   `origin_language` (TEXT nullable) — for i18n metadata (e.g., "en", "de")
-   `temporal_context` (TEXT nullable) — era/date range labels (e.g., "1990s", "pre-2010")
-   `is_preferred` (BOOL default false)
-   `status` (ENUM: DRAFT, PUBLISHED, ARCHIVED)
-   `created_at`, `updated_at`, `published_at`
-   `deleted_at`
-   Indexes:
    -   (`entry_id`, `sense_order`)
    -   full-text index on `definition_text` (if using Postgres FTS)

#### `sense_examples`

-   `id` (PK)
-   `sense_id` (FK)
-   `example_md` (TEXT)
-   `example_text` (TEXT derived)
-   `example_order` (INT)
-   Index (`sense_id`, `example_order`)

#### `tags`

-   `id` (PK)
-   `name` (TEXT)
-   `slug` (TEXT)
-   `description` (TEXT nullable)
-   `created_at`, `updated_at`
-   `deleted_at`
-   UNIQUE (`slug`) WHERE `deleted_at IS NULL`

#### `tag_slug_history`

-   `id` (PK)
-   `tag_id` (FK tags)
-   `slug` (TEXT)
-   `created_at`
-   Constraints:
    -   UNIQUE (`slug`) (enables `/tags/{old-slug}` redirects)
    -   UNIQUE (`tag_id`, `slug`)

#### `entry_tags`

-   `entry_id` (FK)
-   `tag_id` (FK)
-   PRIMARY KEY (`entry_id`, `tag_id`)

#### `entry_relationships`

-   `id` (PK)
-   `from_entry_id` (FK entries)
-   `to_entry_id` (FK entries)
-   `relationship_type` (ENUM)
-   `weight` (INT default 0) (editorial boost)
-   `created_at`, `created_by_user_id`
-   Constraints:
    -   prevent self-links (`from_entry_id != to_entry_id`)
    -   UNIQUE (`from_entry_id`, `to_entry_id`, `relationship_type`) WHERE not deleted
-   Index (`to_entry_id`)

### Sources, documents, citations, provenance

#### `sources`

-   fields per FR-100 (including `trust_tier`, `license_type`, `allowed_use`, `attribution_requirements`, `last_verified_at`, `enabled`)
-   UNIQUE (`source_slug`)

#### `source_documents`

-   `id` (PK)
-   `source_id` (FK)
-   `url` (TEXT)
-   `canonical_url` (TEXT nullable)
-   `title` (TEXT nullable)
-   `content_type` (TEXT)
-   `etag` (TEXT nullable)
-   `last_modified` (TEXT nullable)
-   `fetched_at` (TIMESTAMP)
-   `content_sha256` (TEXT)
-   `snapshot_storage_uri` (TEXT nullable; only if allowed)
-   `snapshot_allowed` (BOOL)
-   `do_not_use` (BOOL default false)
-   `do_not_use_reason` (TEXT nullable)
-   `do_not_use_at` (TIMESTAMP nullable)
-   `do_not_use_by_user_id` (FK users nullable)
-   `deleted_at`
-   UNIQUE (`source_id`, `url`, `content_sha256`)

#### `citations`

-   `id` (PK)
-   `source_id` (FK)
-   `source_document_id` (FK)
-   `url` (TEXT)
-   `citation_text` (TEXT) (e.g., document title)
-   `license_note` (TEXT) (copied from source at time)
-   `attribution_text` (TEXT) (rendered template at time)
-   `accessed_at` (TIMESTAMP)
-   Index (`source_id`)

#### `field_provenance`

-   `id` (PK)
-   `entity_type` (ENUM: ENTRY, SENSE, EXAMPLE, RELATIONSHIP, TAG)
-   `entity_id` (UUID)
-   `field_name` (TEXT) (e.g., `summary_md`, `definition_md`, `expanded_form`)
-   `citation_id` (FK citations)
-   `content_mode` (ENUM: QUOTED, SUMMARIZED, PARAPHRASED)
-   `extraction_method` (ENUM: API, RSS, HTML, PDF, MANUAL)
-   `extractor_version` (TEXT)
-   `extracted_at` (TIMESTAMP)
-   `source_locator` (JSONB: selector, offsets, page number, etc.)
-   Index (`entity_type`, `entity_id`)
-   Constraint: allow multiple provenance records per field (for merged sources)

### Ingest bookkeeping

#### `ingest_runs`

-   `id` (PK)
-   `source_id` (FK)
-   `started_at`, `finished_at`
-   `status` (ENUM: RUNNING, SUCCESS, FAILED, PARTIAL)
-   `triggered_by` (ENUM: CRON, MANUAL, API)
-   `triggered_by_user_id` (FK users nullable)
-   `config_snapshot` (JSONB)
-   `stats` (JSONB: counts)
-   Index (`source_id`, `started_at DESC`)

#### `ingest_items`

-   `id` (PK)
-   `ingest_run_id` (FK)
-   `source_document_id` (FK)
-   `item_key` (TEXT) (stable identifier from source if available)
-   `stage` (ENUM: EXTRACTED, NORMALIZED, DEDUPED, ENRICHED, VALIDATED, REVIEWED, APPLIED, REJECTED, FAILED)
-   `proposed_change` (JSONB) (normalized structured proposal)
-   `stage_outputs` (JSONB) (per-stage artifacts for audit/debug)
-   `diff` (JSONB)
-   `confidence_score` (FLOAT)
-   `license_gate` (ENUM: PASS, WARN, FAIL)
-   `license_gate_reason` (TEXT nullable)
-   `error` (TEXT nullable)
-   Index (`ingest_run_id`, `stage`)

### Admin, auth, audit

#### `users`

-   `id` (PK)
-   `email` (CITEXT unique)
-   `display_name`
-   `auth_provider` (ENUM: OIDC, LOCAL) (default OIDC)
-   `provider_subject` (TEXT nullable) (OIDC sub)
-   `status` (ENUM: ACTIVE, DISABLED)
-   `created_at`, `last_login_at`

#### `roles`

-   `id` (PK)
-   `name` (ENUM: ADMIN, EDITOR, VIEWER)

#### `user_roles`

-   `user_id` (FK)
-   `role_id` (FK)
-   PRIMARY KEY (`user_id`, `role_id`)

#### `audit_events`

-   `id` (PK)
-   `actor_user_id` (FK)
-   `action` (TEXT) (e.g., ENTRY_PUBLISH, SOURCE_DISABLE)
-   `entity_type`, `entity_id`
-   `before` (JSONB), `after` (JSONB)
-   `created_at`
-   `request_id` (TEXT)
-   `ip_hash` (TEXT nullable) (privacy-aware; no raw IP by default)
-   Index (`entity_type`, `entity_id`, `created_at DESC`)

#### `rate_limit_buckets`

-   `id` (PK)
-   `scope` (TEXT)
-   `key` (TEXT) (hashed session/user/IP; privacy-aware)
-   `window_start` (TIMESTAMP)
-   `count` (INT)
-   `created_at`, `updated_at`
-   UNIQUE (`scope`, `key`, `window_start`)

#### `takedown_cases`

-   `id` (PK)
-   `status` (ENUM: OPEN, IN_PROGRESS, CLOSED)
-   `source_id` (FK sources nullable)
-   `source_document_id` (FK source_documents nullable)
-   `entry_id` (FK entries nullable)
-   `requester_contact` (TEXT nullable)
-   `request_text` (TEXT)
-   `internal_notes` (TEXT nullable)
-   `actions` (JSONB)
-   `affected_entity_ids` (JSONB)
-   `created_at`, `updated_at`, `closed_at`
-   `created_by_user_id` (FK users)

### Migration & seed strategy

-   Use transactional migrations (e.g., Prisma Migrate / Flyway / Liquibase) with CI checks.
-   Seed strategy:
    -   bootstrap with initial Sources in `sources` (manual, verified),
    -   optionally seed a minimal starter corpus (sources/tags + a few published entries) to avoid an empty public launch,
    -   run ingest in staging to generate corpus,
    -   promote to production via repeatable ingest + reviewed approvals (not DB dumps).
-   Maintain a `schema_version` table if tooling requires.

---

## 10) Search Design

### Option A: PostgreSQL Full-Text Search (FTS) + pg_trgm (Recommended default for v0.1.0)

**Pros**

-   Fewer moving parts; strong consistency with system-of-record.
-   Good enough for v0.1.0 scale with proper indexes.
-   Supports typo tolerance via `pg_trgm` similarity and prefix matching.

**Cons**

-   Less advanced ranking/typo tolerance than dedicated engines.
-   Complex ranking tuning over time.

**Implementation notes**

-   Store `search_document` per entry/sense (materialized column or view):
    -   title, aliases, expansions, summary, definition text.
-   Index:
    -   `GIN` on `to_tsvector('english', search_document)`
    -   `GIN` on `normalized_title gin_trgm_ops`
    -   `GIN` on `normalized_variant gin_trgm_ops`

### Option B: Dedicated search engine (Meilisearch / Typesense / Elasticsearch)

**Pros**

-   Better typo tolerance, relevancy tuning, instant search UX.
-   Can scale independently.

**Cons**

-   Operational overhead (deployment, backups, consistency).
-   Security hardening (auth, network restrictions).

### Default choice for v0.1.0

**Choose Option A (Postgres FTS + pg_trgm)** to minimize operational complexity while meeting v0.1.0 requirements. Re-evaluate if corpus/traffic exceeds NFR-012, or if relevancy requirements grow.

### Ranking signals (applies to either implementation)

Rank results using weighted signals:

1. Exact title match (case-insensitive) — highest.
2. Exact acronym match — highest (for ACRONYM).
3. Prefix title match.
4. Expansion match (`expanded_form`) for acronyms.
5. Alias/variant match.
6. Definition/summary full-text match.
7. Tag match (low weight).
8. Editorial boosts:
    - preferred sense,
    - relationship weight.
9. Popularity (aggregated views, decayed over 7–30 days).
10. Recency (recently updated, small boost).
11. Source trust (Tier 1 > Tier 2 > Tier 3 > Tier 4) applied to sense weighting, not to hide content.

### Indexing strategy and reindex triggers

-   Recompute search documents when:
    -   entry title/slug changes,
    -   variants change,
    -   senses change/publish/unpublish,
    -   tags change,
    -   relationship changes affecting “see also” suggestions (optional).
-   Batch reindex after ingest apply; incremental per entry for manual edits.

### Search query storage policy (privacy-aware)

-   Default: do **not** store raw queries with identifiers.
-   If needed for product improvement:
    -   store hashed or tokenized queries,
    -   truncate length (max 200 chars),
    -   no IP/user-agent storage alongside queries,
    -   retention max 30 days (configurable).

---

## 11) API + Backend Architecture

### Approach: REST + OpenAPI (Chosen)

**Justification**

-   Clear boundary between public read APIs and admin actions.
-   Easy caching, rate limiting, and integration (future SDKs).
-   OpenAPI supports contract testing and security review.

### Backend components

-   Web app (SSR/SSG) serving pages + calling internal APIs.
-   API service (can be same deployment for v0.1.0) with:
    -   public read endpoints,
    -   admin endpoints with AuthN/AuthZ.
-   Background workers for ingest pipeline and scheduled jobs.
-   Database (Postgres), object storage for allowed snapshots, optional Redis for rate limits/caching (see below).

### Minimal API surface (v0.1.0)

#### Public (read-only)

-   `GET /api/v1/search?q=&type=&tag=&page=`
-   `GET /api/v1/entries/{id}`
-   `GET /api/v1/entries/by-slug?type=TERM|ACRONYM&slug=`
-   `GET /api/v1/terms?letter=&page=`
-   `GET /api/v1/acronyms?letter=&page=`
-   `GET /api/v1/tags`
-   `GET /api/v1/tags/{slug}/entries?page=&type=`
-   `GET /api/v1/sources`
-   `GET /api/v1/sources/{slug}`

#### Admin (authenticated)

-   `POST /api/v1/admin/entries` (create draft)
-   `PATCH /api/v1/admin/entries/{id}` (edit)
-   `POST /api/v1/admin/entries/{id}/publish`
-   `POST /api/v1/admin/entries/{id}/archive`
-   `POST /api/v1/admin/entries/{id}/rollback?revision=`
-   `GET /api/v1/admin/ingest/runs`
-   `POST /api/v1/admin/ingest/runs` (trigger run)
-   `GET /api/v1/admin/ingest/runs/{id}`
-   `POST /api/v1/admin/ingest/items/{id}/approve`
-   `POST /api/v1/admin/ingest/items/{id}/reject`
-   `POST /api/v1/admin/sources` / `PATCH .../sources/{id}`
-   `POST /api/v1/admin/sources/{id}/disable`
-   `GET /api/v1/admin/audit?entity=...`

### Authentication/Authorization (admin/editor)

-   Default: OIDC login (e.g., Google Workspace or GitHub Org) with email allowlist.
-   Roles enforced server-side; deny by default.
-   Session management:
    -   httpOnly, Secure cookies,
    -   sameSite=Lax (or Strict for admin if feasible),
    -   short session TTL (e.g., 8 hours) + idle timeout (e.g., 30 minutes for admin).
-   MFA:
    -   require MFA at IdP for all admin/editor accounts (policy requirement).

### Rate limiting and abuse prevention (public endpoints)

-   Apply:
    -   per-IP rate limits for `/api/v1/search` and high-cost endpoints,
    -   global concurrency limits,
    -   bot mitigation (WAF/CDN rules) for abusive patterns.
-   Responses:
    -   429 with `Retry-After`.
-   Cache public GET responses with ETags.

### Background job architecture (queues/workers)

-   Use Postgres-backed job queue (e.g., `pg-boss`) to reduce dependencies in v0.1.0.
-   Worker types:
    -   ingest fetcher,
    -   parser/normalizer,
    -   dedupe/resolution,
    -   index rebuild,
    -   analytics aggregation (daily).

---

## 12) Frontend Architecture

### Option A: Next.js (React) with App Router + SSG/ISR (Recommended default)

**Pros**

-   Excellent SEO, SSG/ISR, performance patterns.
-   Strong ecosystem and production deployments.
-   Easy to integrate structured metadata, sitemaps.

**Cons**

-   Complexity with server/client boundaries.
-   Must be careful with caching and auth separation.

### Option B: Remix (React) SSR

**Pros**

-   Strong server-first model, forms, caching control.
-   Clean data loading story.

**Cons**

-   Less common ISR-style static regeneration patterns out of the box.

### Default choice for v0.1.0

**Choose Next.js + TypeScript** with a server-first approach:

-   Entry pages pre-rendered with ISR for SEO + speed.
-   Admin UI server-rendered with strict auth.

### Component strategy

-   Design system primitives: Button, Input, Badge, Card, Table, Modal, Toast, Pagination.
-   Content components:
    -   EntryHeader, SenseList, CitationList, RelatedTerms, TagChips.
-   Markdown rendering:
    -   render Markdown to HTML with a strict sanitizer and no raw HTML support.

### State management

-   Prefer server components + URL state.
-   Client state limited to:
    -   search box UI,
    -   admin forms,
    -   modals/drawers.

### Form validation

-   Shared schema validation (e.g., Zod) for client/server.
-   Server is authoritative; client mirrors for UX.

### Error handling

-   Global error boundary for public pages.
-   Admin shows detailed validation errors (not stack traces).
-   All errors include request ID.

### SSR/SSG/ISR strategy

-   Public pages:
    -   Home, tag lists, sources: SSG with periodic ISR (e.g., 10–60 minutes).
    -   Entry pages: ISR with on-demand revalidation when an entry is published/updated.
    -   Search: SSR or client fetch; ensure SEO not required for search results (but page should be indexable optionally).
-   Admin pages: SSR only, no caching.

---

## 13) Security & Threat Model (DETAILED)

### System assets

-   Public content (entries, senses, citations).
-   Admin surface (publish, source config, ingest controls).
-   Source registry (license and policy metadata).
-   Ingest workers and fetched artifacts (potentially malicious).
-   Database integrity (highest priority).
-   Audit logs (tamper-resistance).

### Threat modeling method: STRIDE

| STRIDE                 | Threat                 | Example                      | Impact                        | Key Controls                                                       |
| ---------------------- | ---------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Spoofing               | Admin account takeover | Credential stuffing on admin | Content defacement, data loss | OIDC + MFA, allowlist, rate limits, session security, audit alerts |
| Tampering              | Content tampering      | Unauthorized publish         | Trust/reputation              | RBAC, immutable audit logs, change approvals, code signing in CI   |
| Repudiation            | Deny actions           | Editor denies publishing     | Weak accountability           | Audit events with actor, request_id, timestamps                    |
| Information Disclosure | Data leak              | Logs include secrets/PII     | Compliance/reputation         | Data minimization, secrets scanning, log redaction                 |
| Denial of Service      | Search abuse           | Bot floods /search           | Outage/cost                   | CDN/WAF, rate limiting, caching, circuit breakers                  |
| Elevation of Privilege | Role escalation        | Editor gains admin           | Full compromise               | Server-side RBAC checks, least privilege, tests                    |

### Security requirements and controls

#### Admin AuthN/AuthZ, sessions, MFA

-   OIDC provider required by default; enforce email/domain allowlist.
-   Require MFA at provider (policy + onboarding checklist).
-   Role-based access control:
    -   ADMIN: all permissions including sources/ingest/takedown.
    -   EDITOR: edit entries, review ingest items, cannot change source license fields.
    -   VIEWER: read-only admin visibility.
-   Session management:
    -   httpOnly cookies, Secure, sameSite.
    -   Rotate session on privilege changes and login.
    -   Invalidate sessions on user disable.

#### Input validation & output encoding (XSS)

-   All inputs validated server-side with strict schemas.
-   Markdown:
    -   no raw HTML,
    -   sanitize output with allowlist tags/attributes,
    -   strip/rel=noopener for external links.
-   Escaping:
    -   always escape user-controlled strings in templates.
-   Content Security Policy:
    -   default-src 'self'
    -   script-src 'self' (no inline; use nonces if needed)
    -   worker-src 'self' blob: (required for modern Next.js runtime behavior)
    -   object-src 'none'
    -   base-uri 'self'
    -   frame-ancestors 'none'

#### CSRF

-   For cookie-based admin sessions:
    -   CSRF tokens on state-changing requests OR sameSite=Strict + double-submit token.
-   Admin endpoints must reject cross-origin requests and validate Origin/Referer.

#### Rate limiting / abuse prevention

-   Public:
    -   rate limit search and high-cost endpoints by IP.
    -   CDN caching and bot rules.
-   Admin:
    -   stricter rate limits for login callbacks and write endpoints.
-   Scraping SynAc:
    -   allow legitimate indexing; provide robots.txt and optional API-friendly rate policies.
    -   detect abusive scraping (high request rate) and throttle.

#### SSRF protections (ingest/scraping)

-   Domain allowlist per source.
-   IP range blocks and DNS re-check on connect.
-   Redirect policy: follow only to allowlisted domains; otherwise fail.
-   Disable non-HTTP(S) protocols.
-   No user-supplied URLs in ingest; only configured sources.

#### Supply-chain security

-   Pin dependencies with lockfile; use automated dependency updates.
-   SCA scanning in CI (dependency vulnerability scan).
-   SAST in CI for TS/JS.
-   Build provenance:
    -   generate SBOM (CycloneDX or SPDX),
    -   sign container images if using registry that supports it.
-   Review policy for new parsing libraries (PDF/HTML parsers are high risk).

#### Secrets management

-   Store secrets in managed secret store (must be verified for chosen platform).
-   No secrets in env files committed to repo.
-   Rotate secrets on incident; keep audit trail of rotations (metadata only).

#### Audit logging and tamper considerations

-   Audit events written append-only; restrict deletion.
-   Export audit logs to immutable storage (WORM-capable) if available; otherwise daily signed archive.
-   Alert on:
    -   source disable/enable,
    -   changes to license/allowed_use fields,
    -   bulk publish actions.

#### File/PDF ingestion safety

-   Treat PDFs as untrusted:
    -   size limits,
    -   page limits,
    -   timeouts,
    -   parse in sandbox,
    -   optionally run AV scan for stored artifacts.
-   Detect decompression bombs and pathological parsing cases.

#### Multi-tenant concerns

-   Non-goal for v0.1.0. However:
    -   design RBAC and data model to avoid assumptions that would block multi-tenancy later (e.g., keep user/role tables clean).
    -   do not expose internal IDs publicly where not needed.

---

## 14) Legal/Licensing and Attribution (v0.1.0)

> This section is engineering policy guidance, not legal advice. **Must consult counsel** before finalizing policies and before publishing content from any source.

### License & attribution policy (engineering requirements)

-   SynAc must maintain per-source and per-citation license notes and attribution templates (**must be verified**).
-   Content handling modes:
    1. **Quoted**: verbatim excerpt, limited length, with explicit citation and license compatibility check.
    2. **Summarized**: editor/ingest-generated summary, still cited to source where derived.
    3. **Paraphrased**: reworded explanation; must still cite inspiration sources if materially derived.
-   Default stance:
    -   Prefer summarization/paraphrase with citations unless license explicitly permits copying.
    -   Avoid copying entire definitions from restrictive sources without explicit permission.
-   CC BY / CC BY-SA:
    -   Must show attribution as required; if SA obligations apply, counsel must confirm how it impacts SynAc’s licensing and distribution.
-   Public domain / government works:
    -   Still attribute source for transparency, but license burden lower (must be verified).
-   Proprietary/vendor docs:
    -   Prefer summarization and citation; do not reproduce large verbatim text.
-   Trademarks and brand names:
    -   Use for identification; include disclaimer that trademarks belong to owners.
    -   Avoid implying endorsement.
-   Takedown policy:
    -   Provide a clear contact channel and response SLA (e.g., acknowledge within 3 business days).
    -   Maintain internal case tracking (FR-111).
    -   Support disabling a source and purging derived content.

### Attribution display patterns

-   Per-sense references list with source name + URL + license note.
-   Per-source directory at `/sources` with:
    -   license notes,
    -   attribution statement,
    -   last verified date (must be verified),
    -   contact info for corrections/takedown.

---

## 15) Operations: Deployment, Observability, Incident Readiness

### Environments

-   `dev`: local, seeded with fixtures.
-   `staging`: production-like, includes scheduled ingest against a limited set of sources or recorded snapshots.
-   `prod`: public, locked down.

### Deployment (Railway)

-   **Platform:** Railway (container-based deployment with built-in Postgres)
-   **Database:** Railway Postgres with PITR enabled
-   **Object storage:** Railway volumes or external (Cloudflare R2) for allowed snapshots
-   **CDN:** Cloudflare (or Railway's built-in) for caching and DDoS absorption
-   **Auth:** Clerk or Auth0 (managed, external to Railway)
    -   If using a Clerk custom domain for the Frontend API, the required DNS records must exist (or Clerk JS will fail to load).
-   **Network policies:**
    -   web service can reach DB
    -   ingest workers have restricted egress to allowlisted source domains only (configure via environment)

### CI/CD steps

1. Lint/format/typecheck.
2. Unit + integration tests.
3. Build artifacts (web + worker).
4. SAST + dependency scan + secret scan.
5. Build SBOM.
6. Run DB migrations in staging.
7. Deploy to staging, run smoke tests.
8. Manual approval gate to production.
9. Deploy to prod, run migrations, warm caches, run smoke tests.
10. Post-deploy verification + rollback plan.

### Observability

-   Logging:
    -   structured JSON logs,
    -   include request_id, route, status, latency,
    -   **do not** log raw admin tokens, cookies, or full query strings by default.
-   Metrics:
    -   RPS, latency percentiles, error rates,
    -   search latency, DB query time,
    -   ingest run duration, failures by stage,
    -   queue depth, worker utilization.
-   Tracing:
    -   request_id correlation across web + worker logs (default in v0.1.0),
    -   OpenTelemetry traces (optional; deferred beyond v0.1.0).
-   Alerting:
    -   availability SLO burn,
    -   elevated 5xx,
    -   search latency degradation,
    -   ingest failure spikes,
    -   suspicious admin actions.

### Backups & disaster recovery

-   DB:
    -   PITR enabled, automated daily snapshots.
    -   **Targets:** RPO ≤ 15 minutes, RTO ≤ 2 hours.
-   Object storage:
    -   versioning enabled for stored snapshots (where allowed).
-   Run regular restore drills (quarterly).

### Runbooks (minimum set)

-   Site down (CDN/app/DB triage, rollback)
-   DB restore (PITR, verification, reindex)
-   Ingest halted (worker health, queue, source disable)
-   Ingest published bad content (freeze publishing, rollback revisions, disable source, purge)
-   Search broken (fallback to browse, reindex procedure)
-   Suspected compromise (rotate secrets, invalidate sessions, read-only mode, forensic snapshots)

---

## 16) Testing Strategy

### Coverage targets

-   Unit tests: ≥ 80% for core domain logic (normalization, dedupe, slugging, lint rules).
-   Integration tests: ingest pipeline stages + DB interactions + API contract tests.
-   E2E tests: critical user journeys (search, browse, entry view) + admin publish workflow.

### Ingest pipeline tests

-   Golden fixtures:
    -   HTML pages, RSS items, PDFs stored as test fixtures (respect licensing; use synthetic or permitted samples).
-   Regression suite:
    -   parsing output snapshot tests (normalized JSON),
    -   entity resolution tests (merge vs conflict),
    -   SSRF and redirect blocking tests.
-   Fuzz tests (where feasible):
    -   malformed HTML,
    -   large PDFs within limits,
    -   unexpected encodings.

### Security testing

-   SAST in CI.
-   Dependency scanning in CI.
-   DAST on staging before release (authenticated scan for admin surfaces).
-   CSP validation tests and security header checks.
-   Manual threat model review gate before launch.

### Accessibility testing

-   Automated: axe-core checks in CI for key pages.
-   Manual: keyboard-only navigation and screen reader spot checks for search and entry pages.

### Load testing

-   Search load tests:
    -   sustained QPS with realistic queries,
    -   verify P95 latency and error rates.
-   Ingest load tests:
    -   large batch ingest run with rate limiting,
    -   ensure workers don’t exceed memory/timeouts.

---

## 17) Analytics (Privacy-aware)

### Principles

-   Data minimization.
-   Prefer aggregate metrics; avoid cross-site tracking.
-   No selling/sharing analytics data.

### Events to track (aggregated)

-   Page view: entry page viewed (entry_id, type) — aggregated daily.
-   Search performed: query length bucket, result count bucket (not raw query by default).
-   Click on reference link (source_id) — aggregated.
-   Copy definition (button) — aggregated.

### Search logs policy

-   Default: do not store raw queries.
-   Optional (must be explicitly enabled):
    -   store queries after hashing/tokenization,
    -   truncate and strip potential secrets,
    -   retention 30 days,
    -   no IP association.

### KPIs for v0.1.0

-   Search success rate: % searches followed by entry click within 30 seconds.
-   No-results rate.
-   Top 100 entries by views (aggregate).
-   Editorial throughput: ingest items reviewed/day; approval rate.
-   Content coverage: number of published entries, senses, citations.
-   Site performance: Core Web Vitals p75.

---

## 18) Content Operations & Governance

### Editorial guidelines (style guide)

-   Neutral, technical tone; avoid vendor marketing.
-   Prefer clarity over completeness; link to deeper sources.
-   Avoid absolute claims when disputed; use “Some sources define…” with citations.
-   Include “often confused with” when common.
-   Use consistent capitalization rules:
    -   acronyms uppercase in display, lowercase in slug.
    -   terms in Title Case for display_title if proper noun; otherwise sentence case acceptable (editor choice, but consistent per entry).

### Source quality bar and trust scoring

-   Trust tiers (example rubric; must be tuned):
    -   Tier 1: standards bodies, widely recognized security orgs, government publications (must be verified).
    -   Tier 2: major vendors’ documentation with stable editorial quality (must be verified).
    -   Tier 3: reputable blogs/books (requires more review).
    -   Tier 4: community wikis/low control (generally avoid for v0.1.0).
-   Each source has:
    -   license clarity,
    -   update cadence,
    -   stability of URLs,
    -   contactability,
    -   historical accuracy.

### Handling disputed definitions and multiple senses

-   Prefer multiple senses with clear labels rather than merging conflicting definitions.
-   Mark “preferred” sense only when editorially justified.
-   Always attach citations for each sense.

### Versioning and changelog display policy

-   Public entry page shows:
    -   last updated date,
    -   optionally “What changed” summary for major edits (editor-provided).
-   Admin can view full revision history.

### Moderation model

-   Internal-only moderation: editors/admins.
-   No public feedback channels beyond a contact form/email (captured as Open Question).

---

## 19) Risks & Mitigations (Risk Register)

| Risk             | Description                              | Likelihood | Impact | Mitigations                                                                                        |
| ---------------- | ---------------------------------------- | ---------: | -----: | -------------------------------------------------------------------------------------------------- |
| Legal/licensing  | Publishing incompatible licensed content |        Med |   High | Source registry gates (FR-100/109), counsel review, default no auto-publish, attribution directory |
| Ingest fragility | HTML structure changes break parsers     |       High |    Med | Prefer API/RSS, selector versioning, regression fixtures, alerting on extraction deltas            |
| SEO issues       | Duplicate content/poor indexing          |        Med |   High | Canonical tags, slug redirects, sitemaps, consistent metadata, avoid thin pages                    |
| Abuse/DDoS       | Bots overload search and pages           |       High |    Med | CDN/WAF, rate limiting, caching, circuit breakers, bot detection                                   |
| Supply-chain     | Vulnerable dependency in parsing stack   |        Med |   High | SCA scanning, SBOM, pinned deps, rapid patch process                                               |
| Data corruption  | Bad ingest overwrites good content       |        Med |   High | Review gates, rollback (FR-014), staging validation, canary publishing                             |
| Reputational     | Incorrect definitions harm credibility   |        Med |   High | Multi-source citations, trust tiers, disputed definitions support, editor guidelines               |
| Security breach  | Admin takeover or SSRF in ingest         |    Low/Med |   High | OIDC+MFA, RBAC, audit logs, SSRF egress restrictions, sandboxing                                   |
| Cost overrun     | Search/ingest infra costs grow           |        Med |    Med | Postgres-based search initially, caching, rate limits, budget alerts                               |
| Operational load | Too much manual review backlog           |        Med |    Med | Trust-tier auto-apply for low-risk fields later, better dedupe, batch review UX                    |

---

## 20) Milestones and Release Plan

### Definition of Done — v0.1.0 production-ready

-   All FR-001..FR-016 and FR-100..FR-111 implemented and acceptance-tested.
-   NFR targets met or explicitly waived with documented rationale.
-   Security review completed:
    -   threat model reviewed,
    -   OWASP checklist completed,
    -   admin auth hardened (OIDC + MFA),
    -   SSRF tests passing,
    -   dependency scans clean or exceptions documented.
-   Observability in place: dashboards + alerts + runbooks.
-   Backups configured and restore drill completed successfully.
-   Legal/compliance:
    -   source licenses recorded and verified (must be verified),
    -   attribution rendering verified for each source,
    -   takedown workflow tested.

### Phased plan (Aggressive 1–2 Month Timeline)

> **Note:** Timeline compressed for solo operator. Prioritize core functionality over nice-to-haves.

1. **Week 1–2: Foundation**
    - Core schema, Railway deployment, Clerk/Auth0 setup
    - Entry pages (accordion UI for multiple senses), basic search (Postgres FTS)
    - Admin CRUD for entries/senses
2. **Week 3–4: Ingest MVP**
    - Source registry with NIST + MITRE ATT&CK + OWASP
    - Ingest pipeline: fetch → normalize → dedupe → review queue
    - Provenance tracking, citations, pg-boss job queue
3. **Week 5–6: Polish & Launch**
    - SEO: sitemaps, structured data (DefinedTerm + Article), canonical URLs
    - /changelog with RSS, relationship graph visualization (D3)
    - Security hardening, immediate cache purge on publish
    - Public launch with monitoring and GitHub Issues for feedback

### Deferred to v0.2.0

- Health dashboard
- Public API
- Audience level tagging
- Rich content (images, tables, diagrams)

### Rollout and rollback

-   Rollout:
    -   deploy to prod with feature flags for ingest apply and trending.
    -   on-demand ISR revalidation after publishing.
-   Rollback:
    -   application rollback via previous container release,
    -   content rollback via revision restore,
    -   source disable + purge for problematic ingest.

---

## 21) Open Questions — RESOLVED

> **Status:** All questions resolved. See **Section 22 (Design Decisions)** for consolidated answers.

| # | Question | Resolution | Reference |
|---|----------|------------|-----------|
| 1 | Primary audience | Security practitioners (SOC analysts, pentesters) | §22.1 |
| 2 | Initial sources | NIST + MITRE ATT&CK + OWASP | §22.1 |
| 3 | CC BY-SA appetite | Case-by-case; grandfather existing content on license changes | §22.3 |
| 4 | Vendor docs policy | Same as other sources (license-gate rules) | §22.6 |
| 5 | SynAc editorial license | CC BY 4.0 (attribution required) | §22.8 |
| 6 | Public feedback mechanism | GitHub Issues for transparency | §22.7 |
| 7 | i18n | English-only display; full i18n metadata tracked per field | §22.2 |
| 8 | SEO priorities | Both term pages and tag pages; DefinedTerm + Article schema | §22.8 |
| 9 | Trending definition | 7-day session-based deduplication; anti-gaming via rate limits | §22.4 |
| 10 | Hosting | Railway + managed Postgres | §22.1 |
| 11 | Budget | Not specified; Railway provides predictable pricing | — |
| 12 | External API | Internal only for v0.1.0; public API is v0.2.0 scope | §22.7 |
| 13 | Admin IdP | Clerk or Auth0 (managed auth with MFA) | §22.6 |
| 14 | IP restriction | No restriction; OIDC+MFA sufficient | §22.6 |
| 15 | Raw snapshots | Metadata + extracted text only; no full document storage | §22.2 |
| 16 | Robots.txt policy | Respect universally | §22.3 |
| 17 | Disputed definitions | Show alternates publicly with source attribution; source specificity wins for conflicts | §22.3 |
| 18 | Diagrams/tables | Text and code blocks only for v0.1.0 | §22.2 |
| 19 | Term of the day | No; minimal homepage (search + browse links) | §22.5 |
| 20 | Launch date / team | 1–2 months aggressive timeline; solo operator | §22.1 |

### Additional Decisions (not in original questions)

| Topic | Decision | Reference |
|-------|----------|-----------|
| Rollback granularity | Field-level selective | §22.9 |
| Relationship visualization | Interactive D3 force-directed graph | §22.9 |
| Relationship limit | Hard limit 10 with "View all" | §22.5 |
| High-sense UX | Accordion/collapsible by default | §22.5 |
| CSRF protection | sameSite=Strict only | §22.6 |
| Session timeout behavior | Lose unsaved changes (strict security) | §22.6 |
| Orphaned entries (takedown) | Hard delete immediately | §22.6 |
| OCR policy | High confidence (>95%) only | §22.3 |
| Selector breaks | Heuristic fallback attempt | §22.3 |
| Job queue | pg-boss directly, no abstraction | §22.7 |
| Cache invalidation | Immediate purge on publish | §22.7 |
| Takedown SLA | Acknowledge 3 days, resolve 7 days | §22.7 |
| Public changelog | Yes, /changelog with RSS feed | §22.7 |
| Style lint | All warnings, no blocks | §22.8 |
| Health dashboard | Not needed for v0.1.0 | §22.8 |
| Punctuation variants | Separate entries with cross-links | §22.2 |
| Temporal evolution | Equal weight with temporal labels | §22.2 |
| Edit provenance | Layered history (full chain) | §22.3 |
| Copy attribution | No auto-attribution | §22.5 |
| Sort control | Relevance default + sort dropdown | §22.4 |
| Preview mode | Content preview only | §22.5 |

---

## 22) Design Decisions (Interview Results)

> **Note:** This section documents decisions made during specification review that resolve open questions and clarify implementation details.

### 22.1) Target Context

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Primary Audience** | Security practitioners (SOC analysts, pentesters) | Technical depth, practical focus, assumed baseline knowledge |
| **Team Size (v0.1.0)** | Solo operator (1 person wears all hats) | Simplify workflows; defer complex approval chains |
| **Timeline** | 1–2 months (aggressive MVP) | Launch fast, iterate; defer nice-to-haves |
| **Initial Sources** | NIST + MITRE ATT&CK + OWASP | High-trust, well-structured government/consortium standards |
| **Hosting Platform** | Railway + managed Postgres | Simple container deployment, good DX, built-in Postgres |

### 22.2) Data Model Decisions

| Decision | Choice | Impact |
|----------|--------|--------|
| **Temporal evolution** | Equal weight with temporal labels | All senses shown equally with clear date ranges/context labels; no algorithmic preference |
| **Punctuation variants** | Separate entries with cross-links | Each variant (C2, C&C, CnC) gets own entry page with "See also" to others |
| **i18n metadata** | Full language tracking per field | Track `origin_language` per field; prepare for future localization |
| **Audience level field** | Remove from v0.1.0 | Simplify data model; revisit in v0.2.0 |
| **Rich content** | Text and code blocks only | No images, tables, or diagrams in v0.1.0; reduces complexity |
| **Raw snapshots** | Metadata + extracted text only | No full document storage; store fetch metadata, content hash, extracted snippets |

### 22.3) Ingest & Provenance Decisions

| Decision | Choice | Implementation Notes |
|----------|--------|---------------------|
| **Conflict resolution** | Source specificity wins | Security-focused sources (NIST, MITRE) beat general sources (vendor docs, Wikipedia) |
| **Source priority** | Field-specific preferences | Different fields prefer different sources (e.g., NIST for definitions, vendors for examples) |
| **OCR policy** | High confidence only (>95%) | Attempt OCR; only accept if confidence exceeds 95%; otherwise queue for manual review |
| **Selector breaks** | Heuristic fallback attempt | Try DOM-based heuristics; queue uncertain results for review |
| **Edit provenance** | Layered history (full chain) | Show both: "Derived from [Source], edited by [Editor] on [Date]" |
| **License changes** | Grandfather existing content | Content published under old license remains; only new ingest follows new terms |
| **Robots.txt policy** | Respect universally | Default to respecting robots.txt; crawl only allowed paths |

### 22.4) Search & Discovery Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **Sort control** | Relevance default + sort dropdown | Allow A-Z, Z-A, Recently Updated toggles |
| **Did-you-mean** | Fuzzy ranking sufficient | Trigram similarity handles this; no explicit "Did you mean" UI |
| **Anti-gaming trending** | Session-based deduplication | Count unique sessions (cookie-based) rather than raw page views; rate-limit per IP |

### 22.5) UI/UX Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **High-sense entries (10+)** | Accordion/collapsible by default | Show sense labels collapsed; first sense auto-expanded |
| **Relationship visualization** | Interactive D3 force-directed | Draggable nodes, zoom/pan; loads on-demand |
| **Relationship limit** | Hard limit 10 with "View all" | Show top 10 by weight; expansion for more |
| **Copy attribution** | No auto-attribution | Trust users to attribute; no clipboard modification |
| **Code examples** | Syntax-highlighted blocks only | Standard code blocks with language hints; no execution warnings |
| **Homepage** | Minimal (search + browse links) | Clean, utility-focused; no featured content |
| **Preview mode** | Content preview only | Skip SEO/metadata preview for simplicity |

### 22.6) Security & Auth Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Identity provider** | Clerk or Auth0 | Managed auth with MFA built-in |
| **IP allowlisting** | No restriction (MFA sufficient) | Trust OIDC+MFA; IP restriction adds friction without proportional benefit |
| **CSRF protection** | sameSite=Strict only | Modern browsers handle it; explicit tokens add complexity |
| **Session idle timeout** | Lose unsaved changes | Strict security; editors learn to save frequently |
| **Orphaned entries (takedown)** | Hard delete immediately | 404 for old URLs; clean removal |
| **Vendor docs policy** | Same as other sources | Follow license-gate rules; no special treatment |

### 22.7) Operations & API Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **Public API** | Internal only for v0.1.0 | APIs exist but undocumented; public API is v0.2.0 scope |
| **Job queue** | pg-boss directly, no abstraction | Simple is better; refactor later if needed |
| **Cache invalidation** | Immediate purge on publish | Users see fresh content within seconds |
| **Takedown SLA** | Acknowledge 3 days, resolve 7 days | Reasonable timeline for solo operator |
| **Public changelog** | Yes, /changelog with RSS feed | Transparency for users following corpus evolution |
| **Feedback mechanism** | GitHub Issues | Public issue tracker; community visibility |

### 22.8) Legal & Content Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **SynAc editorial license** | CC BY 4.0 (attribution required) | Open license encouraging reuse; attribution to SynAc required |
| **Structured data** | Both DefinedTerm and Article | Include both schema.org types; search engines pick what they support |
| **Security news** | Out of scope | SynAc is timeless reference; news/events belong elsewhere |
| **Style lint** | All warnings, no blocks | Lint shows issues but editors can override and publish |
| **Health dashboard** | Not needed for v0.1.0 | Defer to v0.2.0; focus on core functionality |

### 22.9) Rollback & Recovery Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| **Rollback granularity** | Field-level selective | Allow rolling back specific fields while keeping others current |
| **Relationship circularity** | Graph visualization | Render visual relationship graph for complex interconnections |

---

## 23) Appendix

### A) Glossary of internal terms used in SPEC.md

-   **Sense:** A specific meaning/definition under an Entry (supports multiple meanings/disambiguation).
-   **Variant/Alias:** Alternate spellings/synonyms/abbreviations that map to an Entry for search and redirects.
-   **Source:** A registered upstream provider of content (website, API, feed, PDF library) with license and attribution metadata.
-   **SourceDocument:** A specific fetched artifact (URL + content hash + fetch metadata) from a Source.
-   **Citation:** A reference record used to attribute a specific SourceDocument and satisfy attribution requirements.
-   **Field Provenance:** A record connecting a specific field value (e.g., a sense definition) to its source, extraction method, timestamp, and locator.
-   **Ingest Run:** A single execution of the ingest pipeline for a Source (manual, API-triggered, or scheduled).
-   **Ingest Item:** A unit of work within an ingest run representing one document/item and its proposed normalized changes.
-   **License Gate:** The publish-time compliance decision (PASS/WARN/FAIL) based on source license/allowed use (must be verified).
-   **Trust Tier:** A quality and reliability classification for sources that influences review/autopublish policy.
-   **ISR (Incremental Static Regeneration):** Rendering strategy where pages are statically served but periodically revalidated/regenerated.

---

### B) Example Entry (Markdown)

> **Note:** This is an illustrative example to demonstrate the required structure, citations, and provenance. Source license details and exact attribution text **must be verified** before production use.

# SAML

**Type:** Acronym  
**Canonical URL:** `/acronym/saml`  
**Summary:** Security Assertion Markup Language (SAML) is an XML-based standard for exchanging authentication and authorization data between an identity provider (IdP) and a service provider (SP), commonly used for single sign-on (SSO).

## Meanings

### Meaning 1 — Security Assertion Markup Language (preferred)

**Expanded form:** Security Assertion Markup Language  
**Definition:** SAML is a standards-based framework that enables a user’s identity and access claims (assertions) to be communicated from an IdP to an SP. It is commonly used to implement web-based SSO by letting an SP rely on an IdP for authentication, while transporting assertions over protocols/bindings (for example, via browser redirects and POSTs).

**Examples**

1. “The organization uses SAML SSO so employees authenticate to the corporate IdP and then access SaaS applications without separate passwords.”
2. “The SP validates the SAML assertion and creates a session for the user based on the claims.”

**Warnings / Notes**

-   SAML assertions are **not** a substitute for transport security; deployments must use HTTPS and validate signatures correctly.
-   Misconfiguration can lead to authentication bypass or account takeover. Treat SAML integration as security-critical.

**Common confusion**

-   **OAuth 2.0**: delegation/authorization framework (often confused with authentication).
-   **OpenID Connect (OIDC)**: authentication layer on OAuth 2.0, frequently used as a modern alternative to SAML for web/mobile.

**Related terms**

-   Identity Provider (IdP)
-   Service Provider (SP)
-   Single Sign-On (SSO)
-   Assertions
-   XML Signature

**References (with attribution)**

-   OASIS — _SAML 2.0 Core Specification_  
    URL: `https://docs.oasis-open.org/security/saml/v2.0/` (example)  
    License/Use: **must be verified**  
    Attribution: “Source: OASIS SAML specification (see link).” (**must be verified**)  
    Accessed/Ingested: 2026-01-02 (**example timestamp**)
-   NIST — Digital Identity guidance (relevant background)  
    URL: `https://pages.nist.gov/800-63-3/` (example)  
    License/Use: **must be verified**  
    Attribution: “Source: NIST Digital Identity Guidelines (see link).” (**must be verified**)  
    Accessed/Ingested: 2026-01-02 (**example timestamp**)

**Provenance (field-level; example)**

-   `summary_md`
    -   Source: OASIS (SAML 2.0 Core), URL above
    -   Extraction: MANUAL (editor summarized)
    -   Extracted at: 2026-01-02T15:10:00Z
    -   Content mode: SUMMARIZED
-   `definition_md`
    -   Source: OASIS (SAML 2.0 Core), URL above
    -   Extraction: MANUAL (editor paraphrased)
    -   Extracted at: 2026-01-02T15:12:00Z
    -   Content mode: PARAPHRASED

---

### C) Optional: Suggested Repo Structure and Coding Standards

#### Suggested repository structure

```text
synac/
  SPEC.md
  README.md
  LICENSE
  docs/
    architecture/
    runbooks/
    policies/
  apps/
    web/                # Next.js app (public + admin UI)
    worker/             # Ingest workers + scheduled jobs
  packages/
    db/                 # DB schema/migrations, query layer
    shared/             # Shared types, validation schemas (Zod), utilities
    eslint-config/      # Shared lint rules
  infra/
    terraform/          # IaC (if used)
    k8s/                # Manifests (if used)
  scripts/
    seed/
    maintenance/
  .github/
    workflows/
      ci.yml
      deploy-staging.yml
      deploy-prod.yml
```

#### Coding standards (v0.1.0)

-   Language/runtime:
    -   TypeScript everywhere; `strict: true`.
    -   Node.js LTS (exact version pinned; must be verified at project start).
-   Formatting/linting:
    -   Prettier (print width 80).
    -   ESLint with security-focused rules (no eval, no unsanitized HTML, etc.).
    -   Markdown lint for docs consistency.
-   Commits:
    -   Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
    -   Require PRs; no direct pushes to main.
-   CI required checks:
    -   typecheck, lint, unit tests, integration tests,
    -   SAST, dependency scan, secret scan,
    -   SBOM generation artifact.
-   Security hygiene:
    -   Dependabot/Renovate for updates.
    -   “High-risk” dependency review for parsers (PDF/HTML).
    -   Documented process for emergency patch releases.

#### Operational standards

-   Feature flags for:
    -   ingest apply/autopublish,
    -   trending visibility,
    -   new sources enablement.
-   “Two-person rule” (recommended) for:
    -   enabling a new source in production,
    -   changing license/allowed_use fields,
    -   enabling auto-publish.
