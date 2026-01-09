# SynAc

SynAc is a public, internet-facing cybersecurity glossary with strong provenance and attribution.

Canonical production domain: `synac.app`.

- Product + engineering specification: `SPEC.md`
- Execution tracker: `PLAN.md`
- Ops docs: `docs/`

## Stack

- Web: Next.js (App Router) + TypeScript (`apps/web`)
- Auth: Clerk (`@clerk/nextjs`)
- DB: Postgres + Prisma (`packages/db`)
- Jobs: pg-boss (`apps/worker`)
- Hosting: Railway (environments: `development`, `staging`, `production`)

## Repo layout

- `apps/web`: public site + admin UI + API routes
- `apps/worker`: ingest + promotion worker (pg-boss)
- `packages/db`: Prisma schema + query layer + seed scripts
- `packages/shared`: shared TS utilities

## Local development

Prereqs:
- Node `22.21.1` (see `.node-version`)
- pnpm `10.27.0` (see `package.json#packageManager`)
- A local Postgres database

Setup:
1. Create a local env file from `.env.example` (do not commit `.env*`).
2. Run migrations + seed:
   - `pnpm db:migrate`
   - `pnpm db:seed`
   - `pnpm db:seed:content` (optional, seeds starter sources/tags/entries)
3. Start dev:
   - `pnpm dev`

Notes:
- Clerk is optional locally. If keys are not present, `/admin/*` will 404 and the site runs without auth.
- Staging-first ingest is enabled when `SYNAC_STAGING_DATABASE_URL` is configured (see `.env.example`).

## Deployment (Railway)

Project name: `synac`.

Services (per environment):
- `synac` (web)
- `worker`
- `Postgres` (prod/dev DB)
- `Postgres-cSfn` (staging DB; `Postgres` in staging is currently unused/no-deploy)

Useful commands:
- Deploy a service: `railway up -e <env> -s <service> -c`
- Check status: `railway service status -a -e <env>`
- Tail logs: `railway logs -e <env> -s <service>`
- Run DB ops inside Railway (recommended when `DATABASE_URL` uses `postgres.railway.internal`):
  - Migrate: `railway ssh -e <env> -s synac pnpm --filter @synac/db db:migrate:deploy`
  - Seed roles/users: `railway ssh -e <env> -s synac pnpm db:seed`
  - Seed starter content: `railway ssh -e <env> -s synac pnpm db:seed:content`
  - Backfill acronyms (reclassify acronym-like terms): `railway ssh -e <env> -s synac pnpm --filter @synac/db db:reclassify:acronyms`
  - Auto-tag entries: `railway ssh -e <env> -s synac pnpm --filter @synac/db db:tag:auto`

## Ingest (staging-first)

Production does not ingest directly. Instead:
- Ingest runs/items are created in `staging` (staging DB).
- The production worker runs promotion jobs to import validated runs into prod.
- Tier‑1 sources auto-apply + auto-publish after validation (Tier‑2+ remain review-gated).

Notes:
- Ingest adapters can populate `entry_variants` (aliases/synonyms/abbreviations). Entry pages surface these as “Also known as”, and shortform entries with multi-word variants show a “Stands for” block.
- Current ingest adapters: NIST CSRC glossary, NICCS (CISA) cybersecurity vocabulary (CSV export), IETF RFC 4949 glossary, MITRE ATT&CK CTI (Enterprise/Mobile/ICS), OWASP vulnerabilities.
- NIST glossary ingest classifies acronym-like titles as `ACRONYM`. If a user lands on `/term/<slug>` for an acronym entry, it permanently redirects to `/acronym/<slug>` (and vice versa).
- Tags are a curated taxonomy; some are auto-applied from entry text via `db:tag:auto`.

Troubleshooting: `docs/runbooks/ingest-promotion.md`.

## Status

Released: `v0.1.4`.

Latest UX note (v0.1.4): single global header search + keyboard command palette (`⌘K` / `Ctrl+K`).

## License

Code is MIT (see `LICENSE`).

SynAc publishes content sourced from third parties with their own licenses and attribution requirements (see `/sources` and per-entry references). The repository license does not override third-party content licenses.

## Contributing

See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.

## Security

For vulnerability reporting, see `SECURITY.md` (please do not open public issues for security reports).
