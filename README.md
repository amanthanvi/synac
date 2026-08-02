# SynAc

[![CI](https://github.com/amanthanvi/synac/actions/workflows/ci.yml/badge.svg)](https://github.com/amanthanvi/synac/actions/workflows/ci.yml)
[![Security](https://github.com/amanthanvi/synac/actions/workflows/security.yml/badge.svg)](https://github.com/amanthanvi/synac/actions/workflows/security.yml)

SynAc is a public, internet-facing cybersecurity glossary built for practitioners: clear disambiguation, strong provenance, and explicit attribution.

Canonical domain: `https://synac.app`.

<p align="center">
  <img src="docs/assets/readme-home.png" alt="SynAc home page" width="900" />
</p>

## Why this exists

Security terms are overloaded. Acronyms collide. Vendor marketing rewrites meanings. One person’s “SOC” is another person’s “SOC”.

SynAc is trying to be the thing you open when you want to answer:

- “What does this mean *here*?”
- “Which definition is supported by an actual source?”
- “Where did this wording come from?”

## What makes SynAc different

- **Senses (multiple meanings) are first-class.** One entry can have multiple meanings with direct links.
- **Provenance is built in.** Definitions carry citations, source metadata, and license notes.
- **Terms and acronyms are treated differently.** `/term/*` and `/acronym/*` have canonical routing with redirects.
- **Curated taxonomy.** Tags are a maintained classification system (not a free-for-all).
- **Content is code.** Every entry the site serves lives in this repository under `content/` — changes flow through pull requests, automated ingest proposes updates as reviewable diffs, and git history is the audit trail. There are no accounts and no private admin surface.

<p align="center">
  <img src="docs/assets/readme-entry.png" alt="SynAc entry page" width="900" />
</p>

## How it works

- `content/` — the source of truth: source registry, tag taxonomy, machine-generated per-source bundles, and human-curated overrides (see `content/README.md`).
- `tools/content` — validates and compiles `content/` into normalized rows (`pnpm content:check`), and syncs them into the Convex deployment.
- `tools/ingest` — fetches upstream sources (NIST, RFC 4949, NICCS, OWASP, MITRE ATT&CK) and regenerates bundles; a scheduled workflow opens a PR when upstream content changes.
- `convex/` — the serving backend: read-only public queries plus anonymous view-count/rate-limit mutations guarded by a server-held service key.
- `apps/web` — the Next.js public site.

Architecture details: `docs/architecture/overview.md`.

## Quickstart (local dev)

Prereqs:
- Node `24` (see `.node-version`)
- pnpm (see `package.json#packageManager` — `corepack enable` handles it)

Fast path:
1. `pnpm install`
2. `CONVEX_AGENT_MODE=anonymous npx convex dev` — starts a throwaway local Convex backend and deploys the functions (writes `.env.local`).
3. `npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev`
4. `pnpm --filter @synac/content-tools sync` — compiles `content/` and seeds the local backend.
5. In another terminal: `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 SYNAC_CONVEX_SERVICE_KEY=local-dev pnpm --filter @synac/web dev`

Docs: `docs/contributing/local-dev.md`.

Verification gate (before PRs): `pnpm gate`.

## Contributing

If you want to help, the highest-leverage contributions are usually:
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

SynAc publishes content sourced from third parties with their own licenses and attribution requirements. The repository’s MIT license does **not** override third-party content licenses.

Policy: `docs/content/licensing.md`

## Roadmap

See `ROADMAP.md`.

## Security

For vulnerability reporting, see `SECURITY.md` (please do not open public issues for security reports).

## License

MIT (see `LICENSE`).
