# SynAc

[![CI](https://github.com/amanthanvi/synac/actions/workflows/ci.yml/badge.svg)](https://github.com/amanthanvi/synac/actions/workflows/ci.yml)
[![Security](https://github.com/amanthanvi/synac/actions/workflows/security.yml/badge.svg)](https://github.com/amanthanvi/synac/actions/workflows/security.yml)

SynAc is a public, internet-facing cybersecurity glossary built for practitioners: clear disambiguation, strong provenance, and explicit attribution.

Canonical domain: `https://synac.app`.

<p align="center">
  <img src="docs/assets/readme-home.png" alt="SynAc home page" width="900" />
</p>

## Why this exists

Security terms are overloaded. Acronyms collide. Vendor marketing rewrites meanings. One person's "SOC" is another person's "SOC".

SynAc is trying to be the thing you open when you want to answer:

- "What does this mean _here_?"
- "Which definition is supported by an actual source?"
- "Where did this wording come from?"

## What makes SynAc different

- Senses (multiple meanings) are first-class. One entry can have multiple meanings with direct links.
- Senses are grouped into meanings. When several sources define the same meaning in different words, one source's definition leads and every other source's wording renders as an attestation beneath it, so you see the agreement and the exact wording at the same time. See `docs/content/senses.md`.
- Provenance is built in: definitions carry citations, source metadata, and license notes.
- Terms and acronyms are treated differently: `/term/*` and `/acronym/*` have canonical routing with redirects.
- The taxonomy is curated: tags are a maintained classification system (not a free-for-all).
- Content is code: every entry the site serves lives in this repository under `content/`. Changes flow through pull requests, automated ingest proposes updates as reviewable diffs, and git history is the audit trail. There are no accounts and no private admin surface.

<p align="center">
  <img src="docs/assets/readme-entry.png" alt="SynAc entry page" width="900" />
</p>

## How it works

- `content/` is the source of truth: source registry, tag taxonomy, machine-generated per-source bundles, and human-curated overrides (see `content/README.md`).
- `tools/content` validates and compiles `content/` into normalized rows (`pnpm content:check`), and syncs them into the Convex deployment.
- `tools/ingest` fetches upstream sources (NIST, RFC 4949, NICCS, OWASP, MITRE ATT&CK) and regenerates bundles; a scheduled workflow opens a PR when upstream content changes.
- `convex/` is the serving backend: read-only public queries plus a single rate-limit mutation guarded by a server-held service key.
- `apps/web` is the Next.js public site.

Architecture details: `docs/architecture/overview.md`.

## Public API and dataset

The glossary is readable as JSON. The read API lives at `/api/v1`, and every
read endpoint is a public, unauthenticated GET. The only POST routes are a
browser CSP report sink and an operator cache hook that needs a secret.

- `/api/v1/openapi.json` is the OpenAPI 3.1 document for the read API.
- `/api/v1/export/entries.json` is the paged bulk export of the dataset.

The editorial layer is published under CC BY 4.0. That covers the summaries,
the meaning labels, the disambiguation notes, the tag assignments, and the
structure of the dataset. Quoted and attested source wording stays under its
own source's license, which the API returns on every citation.

Reference: `docs/api.md`.

## Quickstart (local dev)

Prereqs:

- Node `24` (see `.node-version`)
- pnpm: see `package.json#packageManager` (`corepack enable` handles it)

Fast path:

1. `pnpm install`
2. `CONVEX_AGENT_MODE=anonymous npx convex dev` starts a throwaway local Convex backend and deploys the functions (writes `.env.local`).
3. `npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev`
4. `pnpm --filter @synac/content-tools sync` compiles `content/` and seeds the local backend.
5. In another terminal: `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 SYNAC_CONVEX_SERVICE_KEY=local-dev pnpm --filter @synac/web dev`

Docs: `docs/contributing/local-dev.md`.

Verification gate (before PRs): `pnpm gate`. It runs lint, formatting,
typecheck, unit tests, content validation, and the build.

A separate `Quality` workflow runs on every pull request. It runs the
Playwright plus axe end-to-end suite and Lighthouse CI, neither of which is
part of `pnpm gate`.

## Contributing

If you want to help, the most useful contributions are usually:

- Content: propose terms or sources (issue templates), or edit `content/overrides/**` directly
- Fixing unclear or incorrect docs
- UI/UX + accessibility polish on the public site

Start here:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `GOVERNANCE.md`
- `SUPPORT.md`

## Project docs

- Product/spec: `SPEC.md`
- Ops + runbooks: `docs/` (index: `docs/README.md`)

## Content & licensing

SynAc publishes content sourced from third parties with their own licenses and attribution requirements. The repository's MIT license does not override third-party content licenses.

Policy: `docs/content/licensing.md`

## Roadmap

See `ROADMAP.md`.

## Security

For vulnerability reporting, see `SECURITY.md` (please do not open public issues for security reports).

## License

MIT (see `LICENSE`).
