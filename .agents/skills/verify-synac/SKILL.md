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
2. If the saved snapshot names a different repo root, has no checkout identity, or cannot be read, exit and do not restore. The message names `/tmp/synac-verify-<hash>/snapshot` and tells you to remove that directory or move it aside, then launch again. Print `REUSED` and exit 0 only when doctor is `READY`, this checkout's recorded web tmux session is alive, the process listening on port 3000 is the pid stored in `run.json`, and the recorded `git rev-parse HEAD` and the sha256 of `git diff HEAD` still match. That path does not restore files and does not take a new snapshot. Any other listener on port 3000 is left alone and launch exits 2. When this checkout still owns the listeners and the recorded HEAD or diff hash changed, launch stops those sessions and rebuilds.
3. Otherwise, if the previous launch was killed before it wrote its end-of-launch observation, restore every tool-owned file that differs from that snapshot. Then restore tool-owned files from a finished snapshot when their current bytes still match what that run wrote, and snapshot the hash, contents, mode, staged state, and repo root of the watched files listed below. Right after `npx convex dev` and `npx convex env set`, record only the Convex-owned paths that changed during that step (`skills-lock.json`, `.agents/skills/convex*`, `convex/_generated/ai/`, `.cursor/rules/convex_rules.mdc`) and write each claim to `writes.json` as soon as it is recorded. Right after `next build` or the Next server start, record only `apps/web/AGENTS.md` and `apps/web/next-env.d.ts` when those changed during that step, the same way. Any other change is warned and left in place, including `AGENTS.md`, `CLAUDE.md`, `apps/web/CLAUDE.md`, and `convex.json`. Cleanup records generator-owned files that change after launch returns, and it warns about a new Convex skill file. Leave those bytes in the worktree until cleanup or the next launch that does not reuse a live stack.
4. If port 3000 is open and the listener is not the recorded web pid, or port 3210 is open and the matching tmux session is not one this skill started, exit 2 and leave that process alone. A live web session whose listener pid does not match `run.pids.web` is not reused.
5. Run `pnpm install --frozen-lockfile` when `node_modules` is missing.
6. Install Playwright Chromium with `pnpm --filter @synac/e2e exec playwright install chromium`. Set `VERIFY_SKIP_BROWSER_INSTALL=1` to skip. If Chromium's system libraries are missing, run `pnpm --filter @synac/e2e exec playwright install --with-deps chromium` once. That step needs root.
7. Start tmux session `synac-v-<hash>-convex` with `CONVEX_AGENT_MODE=anonymous npx convex dev` when port 3210 is closed. Stdin is `/dev/null`, so Convex does not run its interactive agent-file install. The session name is written to `run.json` as soon as tmux returns, before the ready check. A launch that times out still leaves the session for cleanup. Ready means the log line `Convex functions ready` in `/tmp/synac-verify-<hash>/synac-verify-convex.log`. If that tmux session exits before the line appears, launch fails with the log path instead of waiting out the timeout. The listener pid is stored with its `/proc` start time once port 3210 is open. The command line itself is not stored.
8. Run `npx convex env set SYNAC_CONVEX_SERVICE_KEY local-dev`.
9. Run `pnpm --filter @synac/content-tools sync`. Ready means stdout contains `tag convergence: verified`. The log is copied to `/tmp/synac-verify-<hash>/evidence/cli-sync.log`. That sync writes the compiled corpus into the local Convex deployment. A later search that returns `access control` is the read-back of those records.
10. Build the web app with `pnpm --filter @synac/web build` unless `VERIFY_WEB_MODE=dev` or `VERIFY_SKIP_BUILD=1` and `apps/web/.next/BUILD_ID` already exists. The build and the server both receive `NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`, `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`, `SYNAC_CONVEX_SERVICE_KEY=local-dev`, and `SYNAC_RATE_LIMIT_SALT=local-dev`.
11. Start tmux session `synac-v-<hash>-web` with `pnpm --filter @synac/web exec next start -H 127.0.0.1 -p 3000`. The session is written to `run.json` before the port is open. The `exec` form is required. `pnpm --filter @synac/web start -- -H 127.0.0.1` makes Next.js treat `-H` as a project directory. `VERIFY_WEB_MODE=dev` uses `pnpm --filter @synac/web exec next dev -H 127.0.0.1 -p 3000` instead of a production build. Say which mode the proof used. Ready means doctor is `READY`.

`docs/contributing/local-dev.md` is the same stack, split across terminals. Use the helper so the sessions are recorded for cleanup.

Logs and state. `<hash>` is the first 12 hex characters of sha256 of this repo root. A second worktree gets its own directory and its own tmux session names. `SYNAC_VERIFY_STATE_DIR` overrides the directory.

- `/tmp/synac-verify-<hash>` is created mode `0700` and must be owned by the user who ran launch. If that directory already exists with another mode or owner, launch exits and does not change its permissions.
- `/tmp/synac-verify-<hash>/run.json` lists sessions and listener pids this launch started. Each pid keeps the process start time, `argv0`, and a sha256 of the `/proc` command line. The command line itself is not stored, because `npx convex dev` puts `--instance-secret` on its argv. The file also stores `git rev-parse HEAD` and the sha256 of `git diff HEAD` from the moment the stack became `READY`.
- `/tmp/synac-verify-<hash>/synac-verify-convex.log`
- `/tmp/synac-verify-<hash>/synac-verify-web.log`
- `/tmp/synac-verify-<hash>/evidence/` is created mode `0700` at launch and kept by cleanup. If that directory already exists with another mode, launch exits and does not change its permissions.

`.env.local` is written by `npx convex dev`. It is gitignored. Do not commit it.

Launch snapshots the hash, contents, and staged state of `AGENTS.md`, `CLAUDE.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `convex.json`, `skills-lock.json`, `.agents/skills/convex*`, `convex/_generated/ai/`, `.cursor/rules/convex_rules.mdc`, and `apps/web/next-env.d.ts`. The copy is stored under `/tmp/synac-verify-<hash>/snapshot/`. `npx convex dev` can rewrite the Convex skill files, `convex/_generated/ai/`, `skills-lock.json`, and `.cursor/rules/convex_rules.mdc`, and it can add new skill directories. `next dev` can rewrite `apps/web/AGENTS.md` and `apps/web/next-env.d.ts`. Launch redirects Convex stdin from `/dev/null` so the interactive installer does not run. The snapshot stores this checkout's repo root. Launch refuses when that path is different, when the manifest has no checkout identity, or when the manifest cannot be read, and the error tells you to remove `/tmp/synac-verify-<hash>/snapshot` or move it aside. Cleanup still stops processes recorded for this checkout. It backs the foreign or legacy manifest up under `/tmp/synac-verify-<hash>/restored/<id>/manifest.json`, warns, and skips the file restore. A run state whose repo root is different is not used to stop processes. Launch records a write only from the hash taken immediately after the Convex or Next step that owns that path, writes that claim to `writes.json` before the next path, and keeps each file mode so a restore puts the executable bit back. If launch is killed before it writes the end-of-launch observation, the next launch that is not reusing a live stack restores tool-owned files from that snapshot before it takes a new one. Cleanup records generator-owned changes that appear after that observation and warns when a new file shows up under `.agents/skills/convex*`. A launch that prints `REUSED` does not restore. Cleanup and a later launch that is not reusing a live stack restore a tool-owned file, including `.cursor/rules/convex_rules.mdc` and `apps/web/next-env.d.ts`, only when its current bytes still equal that record. They write the launch snapshot back, or delete the file when it was absent. `AGENTS.md`, `CLAUDE.md`, `apps/web/CLAUDE.md`, and `convex.json` are left in place and warned. Each launch snapshot has its own run id. Before a restore they copy the current path to `/tmp/synac-verify-<hash>/restored/<run-id>/` and list that backup. A symlink is backed up as a symlink. They never change the git index. If the bytes or the staged state changed in any other way, the file stays and the command prints a warning. After launch the worktree may show those tool writes. After cleanup it matches the launch snapshot for every file that still held the run's bytes.

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

| Code                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `unreachable`       | Nothing answered on the base URL                                           |
| `timeout`           | A request exceeded 5 seconds                                               |
| `empty-dataset`     | `/api/healthz` is 503 or `ok` is false. The content backend did not answer |
| `home-unhealthy`    | The home page is up without the glossary search landmark                   |
| `search-unreadable` | Home rendered, and the search response was not the expected JSON           |
| `search-empty`      | Health and home are fine, and `q=soc` has `meta.total` 0                   |

```bash
node .agents/skills/verify-synac/scripts/doctor.mjs --help
node .agents/skills/verify-synac/scripts/doctor.mjs --json
```

Doctor prints who is listening on port 3000. Each GET uses `AbortSignal.timeout(5000)`. A timed-out request is code `timeout`. A screenshot taken while doctor is `NOT_READY` is not evidence. `pnpm verify:smoke` warns when the port 3000 listener is not the web pid recorded for this checkout.

## Checkpoint

`pnpm gate` is the full checkpoint. Run it once on the final head, after the fast group for the code you touched is green. The CI job timeout is 20 minutes. Stop and report the log if a local gate exceeds 20 minutes. Do not start a second gate while one is still running.

While iterating, run one named group and stay inside its budget:

| Group           | Command                                       | Budget    |
| --------------- | --------------------------------------------- | --------- |
| `web`           | `pnpm --filter @synac/web test`               | 2 minutes |
| `content`       | `pnpm --filter @synac/content-tools test`     | 2 minutes |
| `ingest`        | `pnpm --filter @synac/ingest-tools test`      | 2 minutes |
| `convex`        | `pnpm test:convex`                            | 3 minutes |
| `content-check` | `pnpm content:check`                          | 1 minute  |
| `verify-smoke`  | `pnpm verify:smoke` with the stack already up | 4 minutes |

`pnpm gate` runs lint, convex lint, format, typecheck, convex typecheck, test, tagging check, content check, content history, and build. It does not launch the site, it does not run `verify:drive`, and it does not need tmux. The checkout session test is `pnpm test:verify-tmux`. That command needs tmux on `PATH`. Required CI does not install tmux and does not run that command. The optional verify-smoke workflow installs tmux and runs it, on `workflow_dispatch` only. Skill unit tests stay in `pnpm test` only when they need no apt packages. The end-to-end suite in `apps/e2e` stays `E2E_BASE_URL=http://127.0.0.1:3000 pnpm --filter @synac/e2e test:e2e` against this same stack. Use it when the change touches accessibility or a route the feature map does not list.

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
VERIFY_EVIDENCE_DIR=/tmp/synac-verify-<hash>/evidence \
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

Proof artifacts go to `/tmp/synac-verify-<hash>/evidence/` (override with `VERIFY_EVIDENCE_DIR`). Cleanup never deletes that directory.

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
- the isolated ingest directory `/tmp/synac-verify-<hash>/ingest-content/generated/rfc4949.json` when the upstream fetch runs
- response status and JSON for the public read API, including a 304 on `If-None-Match`

The local Convex sync is the same compiler output production serves. Do not stub those reads. `POST /api/v1/internal/revalidate` needs `SYNAC_REVALIDATE_SECRET` of at least 16 characters. That route is `INCONCLUSIVE` when the secret is unset. Do not invent a secret.

Live `pnpm ingest -- --source rfc4949` fetches the upstream RFC. The helper copies the source into `/tmp/synac-verify-<hash>/ingest-content` so a run cannot rewrite `content/generated/` in the repo. The drive classifies only the last unindented error and an explicit cause such as `[cause]:`. A name counts only when it ends in `Error` or `Exception` (`TypeError`, `RangeError`, `ZodError`, `IngestError`, `[Error: ...]`), or the line is an `✗` or `✘` result, or it is an unprefixed message. A `warning:` line is not an error. A line that is only braces or punctuation, including the closing `}` of a Node error dump, is not an error. A later matching error wins over an earlier `TypeError: fetch failed`. Indented stack frames are ignored, so `ENOTFOUND` in a frame does not make a parser error `INCONCLUSIVE`. The last error is `INCONCLUSIVE` when it is a network failure with no HTTP status (`ENOTFOUND`, `ECONNREFUSED`, `ENETUNREACH`, a connect timeout, `TypeError: fetch failed`, or the ingest CLI line `✗ <source>: fetch failed`, which also covers a TLS failure because Node uses that same message). Any HTTP status is a failure, including `fetch failed (404)`. A parser error is a failure even when an earlier retry line mentions `ENOTFOUND`. Any other non-zero ingest fails `pnpm verify:drive`. The log is `cli-ingest-rfc4949.log`.

## Cleanup

```bash
pnpm verify:cleanup
```

That runs `node .agents/skills/verify-synac/scripts/cleanup.mjs`. It `tmux kill-session`s only `synac-v-<hash>-convex` and `synac-v-<hash>-web` when this checkout's `run.json` lists them. `<hash>` is the first 12 hex characters of sha256 of this repo root. Another worktree has a different directory and different session names, so cleanup does not stop that worktree's sessions or pids. A `run.json` with no repo root is not this checkout. Cleanup warns, copies that file aside, and does not signal its pids. A session is listed as soon as launch starts it, so cleanup still stops a Convex or web process whose ready check never passed. Before it signals a saved pid, it reads `/proc/<pid>` and checks the start time recorded at launch (the hash of the command line when the start time was not stored). It sends SIGTERM, then SIGKILL only if that same start time is still the process. A reused pid is skipped and named in the log, including when the pid is reused during the wait before SIGKILL. The same pid is signaled once when two ports share it. It does not kill processes by name. When the snapshot is foreign, legacy, or unreadable, it warns, copies that manifest aside, skips the file restore, and still stops processes recorded for this checkout. A run state from another checkout is not used to stop processes. It records generator-owned writes that appeared after launch returned, warns about a new Convex skill file, and restores a tool-owned file, including `.cursor/rules/convex_rules.mdc`, to the launch snapshot only when the current bytes still match that record. A missing backup id gets its own directory instead of a shared `unknown` directory. The restored file keeps the mode from the snapshot. `AGENTS.md`, `CLAUDE.md`, `apps/web/CLAUDE.md`, and `convex.json` are left in place and warned. It copies the current path, symlink or file, to `/tmp/synac-verify-<hash>/restored/<run-id>/` and lists each backup before writing the snapshot back. It never changes the git index. Any other change is left in place and printed as a warning. It leaves `/tmp/synac-verify-<hash>/evidence/` in place and prints that path. After every failed launch or drive, run cleanup before starting again so a half-started session does not keep the ports.

Confirm the evidence directory still exists after cleanup before citing it.

## Helpers

| Command               | Script                                                          |
| --------------------- | --------------------------------------------------------------- |
| `pnpm verify:launch`  | `scripts/launch.mjs`                                            |
| `pnpm verify:doctor`  | `scripts/doctor.mjs`                                            |
| `pnpm verify:smoke`   | `scripts/smoke.mjs` (doctor, CLI smoke, `smoke.spec.ts`)        |
| `pnpm verify:drive`   | `scripts/smoke.mjs --drive` (doctor, full CLI, `drive.spec.ts`) |
| `pnpm verify:cleanup` | `scripts/cleanup.mjs`                                           |

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
