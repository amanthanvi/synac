# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Security practitioners — analysts, engineers, responders, students — who hit an overloaded term or acronym mid-task and need to answer: "What does this mean *here*? Which definition is backed by an actual source?" They arrive from search engines or a shared deep link, usually mid-work, and leave as soon as they have the answer.

## Product Purpose

SynAc (synac.app) is a public, internet-facing cybersecurity glossary with clear disambiguation, strong provenance, and explicit attribution. Success is the fastest trustworthy answer: find the entry, read the right sense, see where the wording came from.

## Positioning

Senses (multiple meanings) are first-class — one entry carries several sourced meanings with direct links. Every definition carries citations, source metadata, and license notes. Terms and acronyms are distinct types with canonical routing (`/term/*`, `/acronym/*`). Tags are a curated taxonomy, not a folksonomy. Neighboring glossaries give one unsourced definition; SynAc's mechanism is provenance-backed disambiguation.

## Operating Context

Looked up mid-task from a browser, often beside terminals, ticket queues, or documents; sessions are short and purposeful. Content is ingested from authoritative sources (e.g. NIST, MITRE ATT&CK, ETSI) under their licenses; attribution and license notes are a legal and ethical requirement of display, not decoration. An internal `/admin` area (Clerk-gated) exists for curation and is out of scope for public design work but shares the global token layer.

## Capabilities and Constraints

- Next.js 16 App Router, React 19, CSS Modules (no Tailwind), Convex data backend behind `@synac/db`; react-markdown for definition bodies.
- Public routes: home, search, terms, acronyms, term/[slug], acronym/[slug], tags(+slug), sources(+slug), recent, changelog(+RSS), about, legal, sign-in/up, not-found, error.
- Strict CSP with nonce for inline scripts; theme via `data-theme` + localStorage with system-preference default.
- Entries can have 1–12+ senses; senses carry citations (quoted/paraphrased/summarized), examples, license/attribution notes; acronyms carry expansions ("stands for") and alternates.
- Deep links to senses (`#sense-<id>`) and canonical redirects must keep working.
- Fonts: free/open-source only, self-hosted via next/font. (confirmed)

## Brand Commitments

- Name: SynAc, wordmark case "SynAc". Voice per docs/voice.md: clarity over cleverness, practitioner language, no hype, no cute microcopy, specific headings.
- Identity direction (user-confirmed): quiet, reference-grade craft — the reference/dictionary canon played straight; craft bar is "MDN Web Docs + Vercel Developer Docs with some Merriam-Webster / dictionary canon baked in".
- Light and dark themes both first-class. (confirmed)
- One search affordance: palette-style overlay (⌘K and `/`), no separate inline header input. (confirmed)

## Evidence on Hand

Real published entries with sourced senses (NIST, MITRE ATT&CK, ETSI, etc.) live in the production Convex deployment; not reachable from this development sandbox, so design-time content uses labeled synthetic fixtures modeled on real entries (docs/assets/readme-*.png shows real production content). Do not fabricate sources, licenses, or citation text in shipped UI.

## Product Principles

- Provenance is the product: sources, licenses, and attribution stay visible, never buried.
- Disambiguation first: multiple senses are the norm; the UI must make "which meaning?" effortless.
- The tool disappears into the task: quiet, consistent, fast; no decoration that slows reading.
- Respect the reader's time: mid-task visitors get the answer in seconds, keyboard-first.

## Accessibility & Inclusion

Public reference site: keyboard-first navigation (skip link, `/` and ⌘K shortcuts, focus-visible states), `prefers-reduced-motion` honored, WCAG AA contrast in both themes.
