# Gate versus required CI

`pnpm gate` is the local check. The required status checks on `main` are set by the `fleet-merge-gate` ruleset: `ci`, `Analyze`, `Link check (lychee)`, `End-to-end and Lighthouse`, `Secret scan (gitleaks)`, `Dependency audit (pnpm)`, and `SBOM (CycloneDX)`. A green gate does not by itself make that set green.

This file records the gap. It does not make the gate identical to CI. That redesign is cleanup step 3.

## What `pnpm gate` runs

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
11. `pnpm lint:strict`

## Comparison

| Required check | In `pnpm gate` | Notes |
| --- | --- | --- |
| `ci`: lint, convex lint, format, typecheck, convex typecheck, test, tagging check, content check, content history, build | yes | Same commands as the `ci` job, split there for logs. |
| `ci`: lint with no warnings (`pnpm lint:strict`) | yes | Last step of `pnpm gate`. The `ci` job still runs it as its own step. |
| `ci`: validate Convex functions (`npx convex dev --once`) | no | Step 3. Needs a throwaway local backend. |
| `ci`: `SYNAC_ASSIGNMENTS_BASE_REF` on content history | no | Step 3. CI sets the pull request base SHA, or `github.event.before` on a push. The local command uses `git merge-base HEAD origin/main`, then `HEAD`. |
| Analyze | no | Step 3. CodeQL `security-extended` for JavaScript, TypeScript, and Actions. |
| Link check (lychee) | no | Step 3. Checks the repo's Markdown links. |
| End-to-end and Lighthouse | no | Step 3. Needs the full local stack. |
| Secret scan (gitleaks) | no | Step 3. |
| Dependency audit (pnpm) | no | Step 3. `pnpm audit --audit-level high`. |
| SBOM (CycloneDX) | no | Step 3. Generates `sbom.cdx.json` and uploads it. |

## Intentionally outside the gate

`pnpm test:verify-tmux` needs tmux on `PATH`. `pnpm test` and `pnpm gate` stay on Node and pnpm. The `ci` job installs tmux and runs `pnpm test:verify-tmux` after `pnpm test`. That command is not its own required check. Step 3 should leave it out of `pnpm gate`.

## Remaining for step 3

- Run Convex function validation (`CONVEX_AGENT_MODE=anonymous npx convex dev --once`) from the local gate, or document a separate command and call it from the same place CI does.
- Give content history the same base ref CI uses, instead of the local merge-base fallback.
- Decide which of the other required checks can run locally (lychee, gitleaks, `pnpm audit`, CycloneDX) and which stay CI-only (CodeQL, end-to-end, Lighthouse) while still failing a local "matches required CI" command when they are skipped.
- Keep `pnpm test:verify-tmux` as an explicit CI step, not part of `pnpm gate`.
