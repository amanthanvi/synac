# Local development

This is the quickest path to run SynAc locally for docs + public web contributions.

## Prereqs

- Node `22.21.1` (see `.node-version`)
- pnpm `10.27.0` (see `package.json#packageManager`)
- Local Postgres (any recent version is fine)

## Setup

1. Create an env file:
   - Copy `.env.example` → `.env.local`
   - Do **not** commit `.env*`
2. Create a local database (example name: `synac`).
3. Run migrations + seed:
   - `pnpm db:migrate`
   - `pnpm db:seed`
   - Optional starter content: `pnpm db:seed:content`
4. Start dev:
   - `pnpm dev`

The site should be available at `http://localhost:3000` by default.

## Clerk (auth) in local dev

Clerk is optional locally. If keys are not present, `/admin/*` will 404 and the public site runs without auth.

## Verification

Before opening a PR, run:

- `pnpm gate`

This runs lint, typecheck, tests, and builds across the workspace.

## Troubleshooting

### “Database connection” errors

- Confirm `DATABASE_URL` in `.env.local` points to a running local Postgres instance.
- Confirm the database exists and is reachable from your shell.
- Re-run migrations: `pnpm db:migrate`

### Node/pnpm version mismatch

- Use `.node-version` as the source of truth for Node.
- Use the pinned pnpm version from `package.json#packageManager`.

