# Local development

The quickest path to run SynAc locally.

## Prereqs

- Node `24` (see `.node-version`)
- pnpm (see `package.json#packageManager` — `corepack enable` handles it)

No database to install: local development uses a throwaway anonymous Convex
backend that the Convex CLI downloads and runs for you.

## Setup

1. `pnpm install`
2. Start the local backend (keeps running; deploys the functions and writes
   `.env.local`):

   ```sh
   CONVEX_AGENT_MODE=anonymous npx convex dev
   ```

3. Configure the service key on the local deployment (any value):

   ```sh
   npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev
   ```

4. Seed it from the repo content:

   ```sh
   pnpm --filter @synac/content-tools sync
   ```

5. Run the web app in another terminal:

   ```sh
   NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
   SYNAC_CONVEX_SERVICE_KEY=local-dev \
   pnpm --filter @synac/web dev
   ```

## Everyday commands

- `pnpm gate` — full verification (lint, typecheck, tests, content check, build). Run before every PR.
- `pnpm content:check` — validate + compile `content/` only.
- `pnpm test:convex` — backend test suite (convex-test; no backend needed).
- `pnpm ingest -- --source rfc4949` — regenerate one source bundle from upstream.

## Editing content

See `content/README.md` and the "Contributing content" section of
`CONTRIBUTING.md`. After editing content, re-run the sync (step 4) to see it
locally.
