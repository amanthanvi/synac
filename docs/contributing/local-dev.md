# Local development

Getting SynAc running locally: Postgres, env, migrations, seeds, the dev
servers, and the checks that gate a PR.

Follow the steps in order. Each one assumes the previous one succeeded.

## 1. Prerequisites

- Node `22.21.1` (see `.node-version`; `.nvmrc` matches).
- pnpm `10.27.0` (see `package.json#packageManager`). Use Corepack or install
  that exact version.
- PostgreSQL 16 (local install or Docker; see step 2).

Install workspace dependencies once:

```bash
pnpm install
```

## 2. Postgres and the four databases

Local dev and the test suite use separate databases. Create these:

| Database             | Used by                                                  |
| -------------------- | -------------------------------------------------------- |
| `synac`              | your dev database (`pnpm dev`, seeds)                    |
| `synac_test`         | integration tests (`pnpm test`), truncated on every run  |
| `synac_staging_test` | promotion (staging → prod) integration tests             |
| `synac_shadow`       | empty scratch DB for the migration drift check           |

`synac_shadow` must stay empty. It is only a diffing target, and CI creates it
for the same reason.

### Extensions need superuser rights

The init migration runs `CREATE EXTENSION IF NOT EXISTS citext` and
`CREATE EXTENSION IF NOT EXISTS pg_trgm`
(`packages/db/prisma/migrations/20260102174319_init/migration.sql`). The role in
your `DATABASE_URL` must be allowed to create extensions, which in practice
means a superuser locally.

### Option A: Docker (recommended)

```bash
docker compose up db
```

`docker-compose.yml` at the repo root starts `postgres:16-alpine` and runs
`scripts/db/init.sql`, which creates all four databases and installs `pg_trgm`
and `citext` in the three you migrate. `synac_shadow` is left empty on purpose.
Nothing else to do.

### Option B: your own Postgres

```bash
createdb synac
createdb synac_test
createdb synac_staging_test
createdb synac_shadow
```

Connect as a superuser (or grant your role the ability to create extensions)
before running migrations.

## 3. Environment variables

Copy the example file to the repo root:

```bash
cp .env.example .env
```

`.env*` is gitignored. Never commit it.

Three consumers read env differently, which matters more than it should:

- **Prisma tooling and the `packages/db` scripts** (migrate, seed, search-index,
  drift) load the **repo-root `.env`** (`packages/db/prisma.config.ts`).
- **The web app** is a Next.js project rooted at `apps/web`, so `next dev` and
  `next start` load `apps/web/.env.local`, not the repo root.
- **The worker** reads `process.env` only. It does not load any `.env` file.

The simplest way to satisfy all three is to export the root `.env` into the
shell you run `pnpm dev` from:

```bash
set -a && source .env && set +a
```

Values already present in the environment win over `.env.local`, so this covers
web, worker, and DB scripts at once. If you prefer files, copy the root `.env`
to `apps/web/.env.local` as well and keep the two in sync.

### Variables you will actually need

`.env.example` is the full list with comments. The ones that matter on day one:

- `DATABASE_URL`, for example
  `postgresql://postgres:postgres@localhost:5432/synac?schema=public`
- `NEXT_PUBLIC_SITE_URL`, normally `http://localhost:3000`
- `SYNAC_ADMIN_EMAILS`, a comma-separated allowlist; see below
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`, only if you need
  `/admin`
- `SYNAC_WORKER_MODE`, one of `ingest`, `promotion`, or `all`
- `SHADOW_DATABASE_URL`, only for the drift check (step 8)

### Getting admin access at `/admin`

`/admin/*` is gated by Clerk **and** an email allowlist. `requireAdminActor`
(`apps/web/src/lib/admin.ts`) calls `notFound()` unless all of these hold:

1. Both Clerk keys are set. Without them `/admin/*` 404s and the public site
   runs unauthenticated, which is fine for public-web and docs work.
2. You are signed in through Clerk.
3. Your Clerk **primary email address** appears in `SYNAC_ADMIN_EMAILS` (or
   `SYNAC_EDITOR_EMAILS` for editor-level access).

The email match is what people trip on: it must be the primary address on the
Clerk account you sign in with, not an alias.

## 4. Migrate and generate

```bash
pnpm db:migrate      # prisma migrate dev against DATABASE_URL
pnpm db:generate     # regenerate the Prisma client
```

`pnpm install` already runs `prisma generate` via the `@synac/db` postinstall
hook. Run `pnpm db:generate` by hand after you pull schema changes.

Apply migrations to the test databases too, or the integration tests will fail
on a missing schema:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/synac_test?schema=public" \
  pnpm --filter @synac/db db:migrate:deploy
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/synac_staging_test?schema=public" \
  pnpm --filter @synac/db db:migrate:deploy
```

## 5. Seed

There are two seeds. They do different jobs and are safe to re-run.

### `pnpm db:seed` seeds roles and the admin bootstrap

`packages/db/prisma/seed.ts`:

- Upserts the `ADMIN`, `EDITOR`, and `VIEWER` roles.
- Creates the `system@synac.app` service user and grants it `ADMIN`.
- Creates a user for every address in `SYNAC_ADMIN_EMAILS` and grants `ADMIN`.
- Creates a user for every address in `SYNAC_EDITOR_EMAILS` (minus anyone
  already in the admin list) and grants `EDITOR`.

Run this first, and again whenever you change the allowlists.

### `pnpm db:seed:content` seeds the starter corpus

`packages/db/prisma/seedContent.ts` seeds a small but real corpus:

- The starter Source Registry: NIST CSRC, MITRE ATT&CK (Enterprise, Mobile,
  ICS), OWASP, NICCS (CISA), and IETF RFC 4949, each with license type, allowed
  use, attribution requirements, and trust tier.
- The starter tag set (Identity, Cryptography, Access Control, Threats, Cloud &
  Containers, and so on).
- A minimal published corpus: entries with one sense each, tagged, cited back to
  a source document, with audit events for the create/publish.

Two things to know before you run it:

- `SYNAC_ADMIN_EMAILS` is **required**. The first address becomes the actor on
  the seeded audit events. The script throws without it.
- It makes **network requests** to each cited source URL to record a content
  hash. Offline, it will fail.

Run it when you want browsable content locally. Skip it if you only need an
empty schema.

## 6. Run the dev servers

```bash
pnpm dev
```

The root script is `pnpm -r --parallel --if-present dev`, so this starts the web
app and the worker (and the `@synac/db` type build in watch mode) in one
terminal.

- Web: `http://localhost:3000`.
- Worker: `apps/worker` throws `DATABASE_URL is required` at startup if the
  variable is not in its process environment, because it does not read `.env`.
  Export it (see step 3).
- `SYNAC_WORKER_MODE` selects the worker's job set: `ingest` runs the ingest
  cron and ingest runs, `promotion` runs the staging → prod promotion jobs, and
  `all` runs both. Unset, it defaults to `promotion` when
  `SYNAC_STAGING_DATABASE_URL` is present and `ingest` otherwise. Promotion mode
  requires `SYNAC_STAGING_DATABASE_URL`.

To run only the site: `pnpm --filter @synac/web dev`.

## 7. Tests

```bash
pnpm test
```

> **These are integration tests. They TRUNCATE the database they connect to.**
>
> They run against `synac_test` and `synac_staging_test` and wipe them between
> runs. Never point `DATABASE_URL` at a database that holds data you care
> about, including your dev `synac` database, while running tests.

The harness (`packages/db/src/testing.ts`) refuses to reset unless it is running
under Vitest or `NODE_ENV=test`, **and** `current_database()` ends in `_test`.

`SYNAC_ALLOW_INTEGRATION_DB_RESET=1` bypasses **both** of those checks. It is a
break-glass escape hatch for local debugging, it is deliberately absent from
`.env.example`, and setting it lets the harness truncate whatever database it is
pointed at, whatever the name. Do not set it in a shell that also has production
or staging credentials loaded, and do not put it in a `.env` file.

Single package: `pnpm --filter @synac/web test` (same for `@synac/db`,
`@synac/worker`).

## 8. Migration drift check

Verifies that `schema.prisma` and `prisma/migrations` still agree:

```bash
SHADOW_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/synac_shadow?schema=public" \
  pnpm --filter @synac/db db:migrate:drift
```

The shadow DB must be **empty**. The script exits `2` on drift and prints the
unexpected statements. Raw-SQL objects Prisma cannot express (partial unique
indexes, expression GIN indexes, trigger functions) are allowlisted in
`packages/db/prisma/checkMigrationDrift.ts`. Extend that list only when the
statement really is one of those.

## 9. End-to-end tests

`apps/e2e` runs Playwright with axe accessibility assertions, Chromium only.
E2E runs against a **production build**, not `next dev`:

```bash
pnpm build
pnpm db:seed && pnpm db:seed:content     # e2e needs published content
pnpm --filter @synac/web start           # leave running in one terminal
pnpm --filter @synac/e2e test:e2e        # in another
```

First run only, install the browser:

```bash
pnpm --filter @synac/e2e exec playwright install --with-deps chromium
```

`E2E_BASE_URL` overrides the target (default `http://localhost:3000`) if you
serve the app on another port.

## 10. The verification gate

Before opening a PR:

```bash
pnpm gate
```

That is `pnpm lint && pnpm typecheck && pnpm test && pnpm build` across the
workspace, the same checks CI runs, split there for readable logs.

## Troubleshooting

### `permission denied to create extension "pg_trgm"` (or `citext`)

Your DB role cannot create extensions. Either connect as a superuser, have a
superuser pre-create the extensions in each database, or use
`docker compose up db`, whose init script handles it.

### Migration drift detected (exit code 2)

`schema.prisma` and `prisma/migrations` disagree. Either add the missing
migration (`pnpm db:migrate`) or, if the statement is a raw-SQL object Prisma
cannot express, add it to the allowlist in
`packages/db/prisma/checkMigrationDrift.ts` with a comment saying why.

### Port 3000 already in use

Something else is on 3000 (often a leftover `next start`). Free the port, or run
`pnpm --filter @synac/web dev -- --port 3001` and set `NEXT_PUBLIC_SITE_URL` and
`E2E_BASE_URL` to match.

### `@prisma/client did not initialize yet` / missing model types

The Prisma client was never generated, or is stale after a schema change:

```bash
pnpm db:generate
```

If typecheck still fails, rebuild the DB package: `pnpm --filter @synac/db build`.

### `DATABASE_URL is required`

From a `packages/db` script: the repo-root `.env` is missing or the variable is
unset. From the worker: the variable is not exported into the process
environment (see step 3).

### `/admin` returns 404 while signed in

Expected when Clerk keys are absent. Otherwise, check that your Clerk primary
email is in `SYNAC_ADMIN_EMAILS` and that you re-ran `pnpm db:seed` after
changing it.

## Related docs

- Public web contributions: `docs/contributing/public-web.md`
- Docs writing: `docs/contributing/docs.md`
- Architecture: `docs/architecture/overview.md`
