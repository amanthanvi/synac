# Architecture overview

SynAc is a public glossary with a strong emphasis on provenance and attribution.

## Monorepo layout

- `apps/web`: public site + internal admin UI + API routes (Next.js App Router)
- `apps/worker`: background jobs (pg-boss)
- `packages/db`: Prisma schema, migrations, and query layer
- `packages/shared`: shared TypeScript utilities

## Runtime components

### Web (`apps/web`)

- Serves public pages: home, browse, search, entry pages
- Renders citations and source metadata
- Hosts the internal admin surface under `/admin/*` (Clerk-authenticated)

### Database (Postgres)

- System of record for entries, senses, tags, sources, and ingest runs
- Search implemented with Postgres FTS + `pg_trgm` (see `SPEC.md`)

### Worker (`apps/worker`)

- Runs ingest and promotion jobs via pg-boss
- Implements “staging-first ingest”:
  - ingest runs happen against a staging DB
  - promotion imports validated runs into production

## Source of truth docs

- Product + engineering spec: `SPEC.md`
- Implementation tracker: `PLAN.md`
- Runbooks and ops notes: `docs/`

