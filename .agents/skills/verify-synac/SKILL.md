---
name: verify-synac
description: "Drive SynAc's content CLI and the public Next.js glossary. Use to launch the local stack, run the read-only doctor check, exercise CLI side effects and the site like a user, and capture command output, screenshots, and traces."
disable-model-invocation: true
---

# Verify SynAc

SynAc is a public cybersecurity glossary. Readers search and browse terms, acronyms, tags, and sources in the Next.js app. Maintainers compile, check, sync, and ingest content with the CLI in `tools/content` and `tools/ingest`. There are no accounts.

The feature map is [`references/features/README.md`](references/features/README.md). Open the one file that matches the change. Walk the README top to bottom for a broad sweep, and finish with `journeys.md`.

A maintain pass (`maintain-verification-skill`) edits only this directory: `SKILL.md`, `references/features/`, `scripts/`, and `playwright.config.mjs`. Product code stays untouched. Outcomes are `clean`, `changed` (one PR), or `blocked`. The `verify:*` scripts in the root `package.json` are thin wrappers. Change the script bodies here, and leave those wrappers pointed at this directory.

## Isolate

This skill owns one stack:

- Convex anonymous backend on `http://127.0.0.1:3210` (site port `3211`)
- Web app on `http://127.0.0.1:3000`

A second checkout cannot bind those ports. Launch refuses to start when port 3000 or 3210 is already taken by a process this skill did not start. Doctor may read an existing server. Cleanup never stops it.

Playwright uses a fresh browser context per test, so theme and clipboard stay inside that context. The Convex dataset is the synced repo content and is shared by every context on this machine.

## Launch

`pnpm verify:*` is defined on the repo root. Run it from the root of this checkout. From a package directory, pnpm looks at that package's scripts and exits 254, so use `pnpm -w verify:launch` (and the same `-w` form for doctor, smoke, drive, and cleanup). Each script finds this repo from its own file path and changes to that directory before it runs a content command or Playwright.

From the repo root, with Node 24 first on `PATH` (see `.node-version`):

```bash
export PATH="${NVM_DIR:-$HOME/.nvm}/versions/node/$(nvm version 24)/bin:$PATH"
node -v
pnpm install --frozen-lockfile
pnpm verify:launch
```

`pnpm verify:launch` is `node .agents/skills/verify-synac/scripts/launch.mjs`. It does the following:

1. Exit 2 when Node is older than 24.
2. Restore files from the previous launch snapshot when their current bytes still match what that run wrote. If doctor is `READY`, print `REUSED` and exit 0 without taking a new snapshot.
3. Otherwise snapshot the hash, contents, and staged state of the watched files listed below, then continue. When launch returns, record the bytes that differ from that snapshot. Leave those bytes in the worktree until cleanup or the next launch.
4. If port 3000 or 3210 is open and the matching tmux session is not one this skill started, exit 2 and leave that process alone.
5. Run `pnpm install --frozen-lockfile` when `node_modules` is missing.
6. Install Playwright Chromium with `pnpm --filter @synac/e2e exec playwright install chromium`. Set `VERIFY_SKIP_BROWSER_INSTALL=1` to skip. If Chromium's system libraries are missing, run `pnpm --filter @synac/e2e exec playwright install --with-deps chromium` once. That step needs root.
7. Start tmux session `synac-verify-convex` with `CONVEX_AGENT_MODE=anonymous npx convex dev` when port 3210 is closed. Stdin is `/dev/null`, so Convex does not run its interactive agent-file install. The session name is written to `run.json` as soon as tmux returns, before the ready check. A launch that times out still leaves the session for cleanup. Ready means the log line `Convex functions ready` in `/tmp/synac-verify/synac-verify-convex.log`. The listener pid is stored with its `/proc` start time once port 3210 is open.
8. Run `npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev`.
9. Run `pnpm --filter @synac/content-tools sync`. Ready means stdout contains `tag convergence: verified`. The log is copied to `/tmp/synac-verify/evidence/cli-sync.log`. That sync writes the compiled corpus into the local Convex deployment. A later search that returns `access control` is the read-back of those records.
10. Build the web app with `pnpm --filter @synac/web build` unless `VERIFY_WEB_MODE=dev` or `VERIFY_SKIP_BUILD=1` and `apps/web/.next/BUILD_ID` already exists. The build and the server both receive `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`, `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`, `SYNAC_CONVEX_SERVICE_KEY=local-dev`, and `SYNAC_RATE_LIMIT_SALT=local-dev`.
11. Start tmux session `synac-verify-web` with `pnpm --filter @synac/web exec next start -H 127.0.0.1 -p 3000`. The session is written to `run.json` before the port is open. The `exec` form is required. `pnpm --filter @synac/web start -- -H 127.0.0.1` makes Next.js treat `-H` as a project directory. `VERIFY_WEB_MODE=dev` uses `pnpm --filter @synac/web exec next dev -H 127.0.0.1 -p 3000` instead of a production build. Say which mode the proof used. Ready means doctor is `READY`.

`docs/contributing/local-dev.md` is the same stack, split across terminals. Use the helper so the sessions are recorded for cleanup.

Logs and state:

- `/tmp/synac-verify` is created mode `0700` and must be owned by the user who ran launch. If that directory already exists with another mode or owner, launch exits and does not change its permissions.
- `/tmp/synac-verify/run.json` lists sessions and listener pids this launch started. Each pid keeps the process start time and command line from `/proc`.
- `/tmp/synac-verify/synac-verify-convex.log`
- `/tmp/synac-verify/synac-verify-web.log`
- `/tmp/synac-verify/evidence/` is created mode `0700` at launch and kept by cleanup. If that directory already exists with another mode, launch exits and does not change its permissions.

`.env.local` is written by `npx convex dev`. It is gitignored. Do not commit it.

Launch snapshots the hash, contents, and staged state of `AGENTS.md`, `CLAUDE.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `convex.json`, `skills-lock.json`, `.agents/skills/convex*`, `convex/_generated/ai/`, `.cursor/rules/convex_rules.mdc`, and `apps/web/next-env.d.ts`. The copy is stored under `/tmp/synac-verify/snapshot/`. `npx convex dev` can rewrite the Convex skill files, `convex/_generated/ai/`, `skills-lock.json`, and `.cursor/rules/convex_rules.mdc`, and it can add new skill directories. `next dev` can rewrite `apps/web/AGENTS.md` and `apps/web/next-env.d.ts`. Launch redirects Convex stdin from `/dev/null` so the interactive installer does not run. When launch returns it records which watched files differ from the snapshot. Cleanup and the next launch restore a watched file, including `.cursor/rules/convex_rules.mdc`, only when its current bytes still equal that record. They write the launch snapshot back, or delete the file when it was absent. Each launch snapshot has its own run id. Before a restore they copy the current path to `/tmp/synac-verify/restored/<run-id>/` and list that backup. A symlink is backed up as a symlink. They never change the git index. If the bytes or the staged state changed in any other way, the file stays and the command prints a warning. After launch the worktree may show those tool writes. After cleanup it matches the launch snapshot for every file that still held the run's bytes.

## Doctor

Run this first whenever a drive looks wrong. It only sends GET requests.

```bash
pnpm verify:doctor
```

`READY` (exit 0) means all of the following:

- `GET /api/healthz` is 200 and `ok` is true
- `GET /` is 200 and the HTML contains `Glossary search`
- `GET /api/v1/search?q=soc` is 200 and `meta.total` is greater than 0

Anything else prints `NOT_READY` and exits 2.

| Code | Meaning |
| --- | --- |
| `unreachable` | Nothing answered on the base URL |
| `empty-dataset` | `/api/healthz` is 503 or `ok` is false. The content backend did not answer |
| `home-unhealthy` | The home page is up without the glossary search landmark |
| `search-unreadable` | Home rendered, and the search response was not the expected JSON |
| `search-empty` | Health and home are fine, and `q=soc` has `meta.total` 0 |

```bash
node .agents/skills/verify-synac/scripts/doctor.mjs --help
node .agents/skills/verify-synac/scripts/doctor.mjs --json
```

Doctor prints who is listening on port 3000. A screenshot taken while doctor is `NOT_READY` is not evidence.

## Checkpoint

`pnpm gate` is the full checkpoint. Run it once on the final head, after the fast group for the code you touched is green. The CI job timeout is 20 minutes. Stop and report the log if a local gate exceeds 20 minutes. Do not start a second gate while one is still running.

While iterating, run one named group and stay inside its budget:

| Group | Command | Budget |
| --- | --- | --- |
| `web` | `pnpm --filter @synac/web test` | 2 minutes |
| `content` | `pnpm --filter @synac/content-tools test` | 2 minutes |
| `ingest` | `pnpm --filter @synac/ingest-tools test` | 2 minutes |
| `convex` | `pnpm test:convex` | 3 minutes |
| `content-check` | `pnpm content:check` | 1 minute |
| `verify-smoke` | `pnpm verify:smoke` with the stack already up | 4 minutes |

`pnpm gate` runs lint, convex lint, format, typecheck, convex typecheck, test, tagging check, content check, content history, and build. It does not launch the site and it does not run `verify:drive`. The end-to-end suite in `apps/e2e` stays `E2E_BASE_URL=http://127.0.0.1:3000 pnpm --filter @synac/e2e test:e2e` against this same stack. Use it when the change touches accessibility or a route the feature map does not list.

## Drive

Prefer the helpers in this skill. They use the accessible names already on the pages.

Fast path (doctor, `content:check`, `content:compile` file write, home search `soc`, open the first result):

```bash
pnpm verify:smoke
```

Feature sweep (every file under `references/features/`, including CLI side effects):

```bash
pnpm verify:drive
```

Both commands run doctor first. If doctor exits 2, the browser does not open and the CLI drive does not run.

One UI feature, after doctor is `READY`:

```bash
E2E_BASE_URL=http://127.0.0.1:3000 \
VERIFY_EVIDENCE_DIR=/tmp/synac-verify/evidence \
NODE_PATH="$PWD/apps/e2e/node_modules" \
node apps/e2e/node_modules/@playwright/test/cli.js test \
  --config .agents/skills/verify-synac/playwright.config.mjs \
  .agents/skills/verify-synac/scripts/drive.spec.ts \
  -g "command palette"
```

`NODE_PATH` is required. The specs import `@playwright/test`, which is installed for `@synac/e2e` and is not hoisted to the repo root. `pnpm verify:smoke` and `pnpm verify:drive` set it.

Run that from the repo root. The config file is `playwright.config.mjs` next to this skill.

One CLI feature:

```bash
node .agents/skills/verify-synac/scripts/cli.mjs --help
node .agents/skills/verify-synac/scripts/cli.mjs
```

Stable handles:

- Home search: textbox `Search` inside the page (the header control named `Search` is a button and opens the palette).
- Palette: button `Search`, then combobox `Search terms and acronyms`. `Control+K` or `Meta+K` opens it. `/` opens it when focus is outside a text field. `Escape` closes it. `Enter` activates the highlighted option.
- Browse: navigation `Term letters` or `Acronym letters`, textbox `Filter entries`, combobox `Sort`.
- Tags: textbox `Filter tags`.
- Theme: button whose name starts with `Theme:`. The stored value is `localStorage['synac-theme']` and `document.documentElement.dataset.theme`.
- Entry: button `Copy link to this sense`, status text `Link copied`, summary `Cite`, link `Citation record (JSON)`.
- Mobile, below 920px: button `Open menu`, navigation `Mobile`.
- Header navigation `Primary`. Footer is `contentinfo`.

Seeded slugs the corpus is known to contain (the same ones `apps/e2e/tests/helpers.ts` uses):

- term `access-control` (heading `access control`)
- term `domain`
- acronym `black` (heading `BLACK`)
- acronym `2fa` (a `/term/2fa` visit redirects to `/acronym/2fa`)
- tag `identity-access` (heading `Identity and access`)
- source `rfc4949`
- query `soc`

## Evidence

Proof artifacts go to `/tmp/synac-verify/evidence/` (override with `VERIFY_EVIDENCE_DIR`). Cleanup never deletes that directory.

- `cli-*.log` and `cli-report.json` from the CLI helper
- `cli-sync.log` from launch, with the line `tag convergence: verified`
- `*.png` screenshots taken by the specs
- `test-results/` Playwright traces (`trace.zip` per test, trace is `on`)
- `playwright-report/` HTML report
- `tools/content/dist/compiled.json` is the compile side effect inside the repo. `dist/` is gitignored. The proof is the file's `contentVersion` matching the `content ok:` line, plus `entries` length greater than 0

A proof exercises the user path: type in the search box, click a result, press the shortcut, run the CLI. Reading `/api/healthz` is the doctor check, and it is not the proof that search works.

Capture the action and the end state. Examples: the search box filled, then the entry heading; `content:compile` run, then `compiled.json` on disk; sync log `tag convergence: verified`, then `GET /api/v1/search?q=soc` with `meta.total` greater than 0.

Side effects worth reading:

- URL, heading, and `aria-current`
- `localStorage['synac-theme']` and `data-theme` after a click and again after reload
- clipboard text after Copy link to this sense
- `tools/content/dist/compiled.json` after `pnpm content:compile`
- the isolated ingest directory `/tmp/synac-verify/ingest-content/generated/rfc4949.json` when the upstream fetch runs
- response status and JSON for the public read API, including a 304 on `If-None-Match`

The local Convex sync is the same compiler output production serves. Do not stub those reads. `POST /api/v1/internal/revalidate` needs `SYNAC_REVALIDATE_SECRET` of at least 16 characters. That route is `INCONCLUSIVE` when the secret is unset. Do not invent a secret.

Live `pnpm ingest -- --source rfc4949` fetches the upstream RFC. The helper copies the source into `/tmp/synac-verify/ingest-content` so a run cannot rewrite `content/generated/` in the repo. The drive classifies only the final thrown error and its cause. That error is `INCONCLUSIVE` when it is a network failure with no HTTP status (`ENOTFOUND`, `ECONNREFUSED`, `ENETUNREACH`, a connect timeout, or `TypeError: fetch failed`). Any HTTP status is a failure, including `fetch failed (404)`. A parser error is a failure even when an earlier retry line mentions `ENOTFOUND`. Any other non-zero ingest fails `pnpm verify:drive`. The log is `cli-ingest-rfc4949.log`.

## Cleanup

```bash
pnpm verify:cleanup
```

That runs `node .agents/skills/verify-synac/scripts/cleanup.mjs`. It `tmux kill-session`s only `synac-verify-convex` and `synac-verify-web` when `run.json` lists them. A session is listed as soon as launch starts it, so cleanup still stops a Convex or web process whose ready check never passed. Before it signals a saved pid, it reads `/proc/<pid>` and checks the start time recorded at launch (the command line when the start time was not stored). A reused pid is skipped and named in the log. The same pid is signaled once when two ports share it. It does not kill processes by name. It restores a watched file, including `.cursor/rules/convex_rules.mdc`, to the launch snapshot only when the current bytes still match what that run wrote. It copies the current path, symlink or file, to `/tmp/synac-verify/restored/<run-id>/` and lists each backup before writing the snapshot back. It never changes the git index. Any other change is left in place and printed as a warning. It leaves `/tmp/synac-verify/evidence/` in place and prints that path. After every failed launch or drive, run cleanup before starting again so a half-started session does not keep the ports.

Confirm the evidence directory still exists after cleanup before citing it.

## Helpers

| Command | Script |
| --- | --- |
| `pnpm verify:launch` | `scripts/launch.mjs` |
| `pnpm verify:doctor` | `scripts/doctor.mjs` |
| `pnpm verify:smoke` | `scripts/smoke.mjs` (doctor, CLI smoke, `smoke.spec.ts`) |
| `pnpm verify:drive` | `scripts/smoke.mjs --drive` (doctor, full CLI, `drive.spec.ts`) |
| `pnpm verify:cleanup` | `scripts/cleanup.mjs` |

```bash
node .agents/skills/verify-synac/scripts/launch.mjs --help
node .agents/skills/verify-synac/scripts/doctor.mjs --help
node .agents/skills/verify-synac/scripts/cli.mjs --help
node .agents/skills/verify-synac/scripts/smoke.mjs --help
node .agents/skills/verify-synac/scripts/cleanup.mjs --help
```

`scripts/evidence.ts` writes screenshots into `VERIFY_EVIDENCE_DIR`.

## How to report

Put a Proof section on the pull request:

```markdown
### Proof
- Commands: the exact commands, including `pnpm verify:doctor` and the drive you ran
- Evidence: command logs, screenshot paths, and trace paths that still exist after cleanup
- Results: pass or fail per command, plus the observable end state (URL, heading, file written, record read back, attribute)
- INCONCLUSIVE: any step that could not run, and the concrete reason (port busy, revalidate secret unset, browser library missing, ingest network unreachable). Any other ingest failure is a failure.
```

A missing check is `INCONCLUSIVE`. Do not describe it as passed.

## Feature map

[`references/features/README.md`](references/features/README.md) is the sweep order. Each feature file has the same four headings: Sub-features, How to get to it (user POV), Driving it with Playwright or Driving it with the CLI, Gotchas.
