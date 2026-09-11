# SynAc

[![CI](https://github.com/amanthanvi/synac/actions/workflows/ci.yml/badge.svg)](https://github.com/amanthanvi/synac/actions/workflows/ci.yml)
[![Security](https://github.com/amanthanvi/synac/actions/workflows/security.yml/badge.svg)](https://github.com/amanthanvi/synac/actions/workflows/security.yml)

SynAc is a public, internet-facing cybersecurity glossary built for practitioners: clear disambiguation, strong provenance, and explicit attribution.

Canonical domain: `https://synac.app`.

<p align="center">
  <img src="docs/assets/readme-home.png" alt="SynAc home page: a search box over a list of recently updated terms and acronyms" width="900" />
</p>

## Why this exists

Security terms are overloaded. Acronyms collide. Vendor marketing rewrites meanings. One person’s “SOC” is another person’s “SOC”.

SynAc is trying to be the thing you open when you want to answer:

- "What does this mean _here_?"
- “Which definition is supported by an actual source?”
- “Where did this wording come from?”

## What makes SynAc different

- **Senses (multiple meanings) are first-class.** One entry can have multiple meanings with direct links.
- **Provenance is built in.** Definitions carry citations, source metadata, and license notes.
- **Terms and acronyms are treated differently.** `/term/*` and `/acronym/*` have canonical routing with redirects.
- **Curated taxonomy.** Tags are a maintained classification system (not a free-for-all).

<p align="center">
  <img src="docs/assets/readme-entry.png" alt="SynAc entry page: a term with its senses, each definition attributed to its source" width="900" />
</p>

## Quickstart (local dev)

Prereqs:

- Node `22.21.1` (see `.node-version`)
- pnpm `10.27.0` (see `package.json#packageManager`)
- A local Postgres database

Docs: `docs/contributing/local-dev.md`

Fast path:

1. Copy `.env.example` → `.env.local` (do not commit `.env*`).
2. Migrate + seed:
   - `pnpm db:migrate`
   - `pnpm db:seed`
3. Run:
   - `pnpm dev`

Verification gate (before PRs): `pnpm gate`.

## Contributing

If you want to help, the highest-leverage contributions are usually:

- Fixing unclear or incorrect docs
- UI/UX + accessibility polish on the public site
- Editorial YAML in `content/**`: sense labels, disambiguation notes, "often confused with" pairings
- Content corrections _with sources_ (open an issue; see templates)

Start here:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `GOVERNANCE.md`
- `SUPPORT.md`

Contribution boundary (by design): **docs, public web, and the `content/` editorial layer**. Changes to ingest/DB/worker/admin/API require maintainer approval.

The editorial layer is how you improve what SynAc _says about meanings_ without touching code: one YAML file per entry, reviewed as a normal PR, applied by the worker's `editorial_sync` job. Schema and workflow: `docs/content/editorial-layer.md`. Tag rules: `docs/content/taxonomy.md`.

## Project docs

- Product/spec: `SPEC.md`
- Execution tracker: `PLAN.md`
- Ops + runbooks: `docs/` (index: `docs/README.md`)

## Public API & dataset

The published glossary is readable as JSON at `https://synac.app/api/v1`. It returns entries and their senses, the tag taxonomy, the source registry, search (including `scope=senses`, which searches meanings rather than entries), and per-sense citation records. No key, no registration. There is a machine-readable `openapi.json`, and a bulk dataset export at `export/entries.json` / `export/entries.csv`.

Reference: `docs/api.md`

The export mixes two licenses and you take on both: SynAc's editorial layer is **CC BY 4.0** (attribution to SynAc required), while third-party source content keeps each source's own license and attribution requirements. Details: `docs/content/licensing.md`.

## Content & licensing

SynAc publishes content sourced from third parties with their own licenses and attribution requirements. The repository’s MIT license does **not** override third-party content licenses.

There are three layers, each with its own license: MIT for the code, CC BY 4.0 for SynAc's own editorial wording in `content/**`, and each source's own terms for the content it supplied.

Policy: `docs/content/licensing.md`

## Roadmap

See `ROADMAP.md`.

## Security

For vulnerability reporting, see `SECURITY.md` (please do not open public issues for security reports).

## License

MIT (see `LICENSE`).
