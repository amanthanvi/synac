# Local development

The quickest path to run SynAc locally.

## Prereqs

- Node `24` (see `.node-version`)
- pnpm (see `package.json#packageManager`; `corepack enable` handles it)

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
   SYNAC_RATE_LIMIT_SALT=local-dev \
   pnpm --filter @synac/web dev
   ```

## Everyday commands

- `pnpm gate` runs the full verification gate. Run it before every PR.
- `pnpm content:check` validates and compiles `content/` only.
- `pnpm test:convex` runs the backend test suite with convex-test. No running
  backend needed.
- `pnpm ingest -- --source rfc4949` regenerates one source bundle from
  upstream.

## Verification gate

`pnpm gate` runs these steps in order:

1. `pnpm lint`
2. `pnpm lint:convex`
3. `pnpm format`
4. `pnpm typecheck`
5. `pnpm typecheck:convex`
6. `pnpm test`
7. `pnpm tagging:check`
8. `pnpm content:check`
9. `pnpm content:history`
10. `pnpm build`

CI runs the same list, so a green local gate means a green CI. Run the gate
before you push, not after CI tells you.

`pnpm gate` does not run the end-to-end suite. The `Quality` workflow runs
that.

## End-to-end tests

The e2e suite needs the full local stack, including a production build of the
web app. Install the browser once:

```sh
npx playwright install --with-deps chromium
```

Then bring the stack up, each step in order:

1. Start the local backend and leave it running:

   ```sh
   CONVEX_AGENT_MODE=anonymous npx convex dev
   ```

2. Set the service key on the local deployment:

   ```sh
   npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev
   ```

3. Seed it from the repo content:

   ```sh
   pnpm --filter @synac/content-tools sync
   ```

4. Build the web app:

   ```sh
   NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
   SYNAC_CONVEX_SERVICE_KEY=local-dev \
   SYNAC_RATE_LIMIT_SALT=local-dev \
   NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
   pnpm --filter @synac/web build
   ```

5. Serve the build:

   ```sh
   NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 \
   SYNAC_CONVEX_SERVICE_KEY=local-dev \
   SYNAC_RATE_LIMIT_SALT=local-dev \
   NEXT_PUBLIC_SITE_URL=http://localhost:3000 \
   pnpm --filter @synac/web start
   ```

6. Run the suite against it:

   ```sh
   E2E_BASE_URL=http://localhost:3000 pnpm --filter @synac/e2e test:e2e
   ```

The suite is Playwright plus axe, chromium only.

## Editing content

See `content/README.md` and the "Contributing content" section of
`CONTRIBUTING.md`. After editing content, re-run the sync (step 4) to see it
locally.
