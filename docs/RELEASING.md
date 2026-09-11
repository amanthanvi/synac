# Releasing SynAc

Deployment is continuous. Every push to `main` triggers the `Deploy` workflow,
which runs the full repository gate, deploys the Convex functions, syncs the
compiled content, waits for stale-row pruning to converge, and then asks the
web app to revalidate its cached pages. A failed gate or a non-convergent sync
never reports a successful content deployment. Vercel builds the web app from
`main` independently.

The revalidate step is the last one. It sends `POST` to
`$NEXT_PUBLIC_SITE_URL/api/v1/internal/revalidate` with an
`Authorization: Bearer $SYNAC_REVALIDATE_SECRET` header and the body
`{"tags":["content"]}`. Pages read through a tagged server-side data cache, so
without this call a merged content change stays invisible until the cache
entry expires on its own. A failed revalidate call leaves stale pages, not
wrong pages, because the pages and the API read the same active generation.

There is no manual deploy trigger. `workflow_dispatch` was removed from the
`Deploy` workflow. To force a redeploy, push to `main`:

```sh
git commit --allow-empty -m "chore: redeploy"
git push
```

Content sync stages a complete, hash-bound generation while the prior
generation remains active. Activation is one Convex mutation after exact
batch, table, tag, and source counters match. A failed stage is safe to retry;
if its content version is unchanged, the client resumes at the first
unacknowledged batch. To abandon a stale pending generation, run
`npx convex run sync:abortPending '{"syncVersion":"<pending-version>"}' --prod`
and wait until `sync:status` no longer reports `pending` before deploying a
different generation.

Deploy is push-only. The assignment-history gate receives the trusted previous
`main` SHA from GitHub and fails if accepted assignments disappear without
reviewed removals. Recovery uses a reviewed `main` commit; there is no
operator-supplied history baseline.

`pnpm gate` runs the compiler first, then assignment history. Outside CI, the
history check uses the merge base with `origin/main` when available. Set
`SYNAC_ASSIGNMENTS_BASE_REF=<trusted-base-sha>` only when reproducing a specific
CI comparison locally.

## Tag taxonomy and assignment releases

Tag classification is an offline, one-off GitOps operation. It has no schedule
and no request-time model dependency. Transport request/response files and raw
review events stay ignored or in the external sealed store; only reviewed
assignments, manifests, hashes, and aggregate reports enter Git.

1. Prepare and run the pinned classifier generation under
   `experiments/tagging/production-backfill/`.
2. Collect only matching, evidence-valid proposals from both order-reversed
   passes.
3. Run the independent local adversarial reviewers. Any disagreement, invalid
   evidence, prompt-injection signal, unavailable model, or incomplete output
   abstains.
4. Emit `content/tag-assignments.json` and its deterministic report with
   `emit-assignments.ts`. Never edit the artifact by hand.
5. Review added/removed pairs, per-Tag counts, corpus coverage, provenance
   hashes, and any explicit removal records; then run `pnpm gate`.
6. Merge through the normal content PR. Deployment stages and verifies the
   complete generation before the atomic activation described above.

Taxonomy v2 fails closed without a release assignment artifact. Changed Entry
text invalidates its assignment hash. Removing a prior accepted pair requires
a reviewed removal record. If inference or review fails, commit nothing; the
previous content generation remains production-active. Rollback is a reviewed
revert of the taxonomy/assignment commit followed by the normal sync.

## Required configuration

GitHub repository secrets:

- `CONVEX_DEPLOY_KEY` is the production deploy key from the Convex dashboard,
  under Deployment settings then Deploy keys.
- `SYNAC_REVALIDATE_SECRET` is the bearer token the Deploy workflow presents to
  the revalidate endpoint. It must match the value set in Vercel.

Convex production deployment environment variables:

- `SYNAC_CONVEX_SERVICE_KEY` is a random secret shared with the web server.

Vercel environment variables (see `.env.example`):

- `NEXT_PUBLIC_CONVEX_URL` points at the production Convex deployment.
- `NEXT_PUBLIC_SITE_URL` is `https://synac.app` in production.
- `SYNAC_CONVEX_SERVICE_KEY` matches the value set on the Convex deployment.
- `SYNAC_RATE_LIMIT_SALT` is required in production. The server refuses to
  start without it; there is no development fallback value.
- `SYNAC_REVALIDATE_SECRET` matches the GitHub repository secret of the same
  name.

Rotating any of these means setting the new value in both places before the
next deploy. See `docs/runbooks/suspected-compromise.md`.

## Vercel project settings

The repository keeps one Vercel config at the repository root, `vercel.json`.
The Vercel project's Root Directory must therefore stay at the repository root
and must not be set to `apps/web`. The root config installs the whole
workspace, builds only `@synac/web`, and points Vercel at
`apps/web/.next` for the output. Setting Root Directory to `apps/web` makes
Vercel look for a config that no longer exists there, and the workspace install
fails.

## Cutting a versioned release

1. Confirm CI is green on `main`.
2. Update `CHANGELOG.md`, which is canonical, and mirror the entry in
   `apps/web/src/changelog.ts`.
3. Bump `version` in the root `package.json` and in every workspace
   `package.json`.
4. Bump `version` in `CITATION.cff` to the same number.
5. Run `pnpm version:check`. It compares the root `package.json`, every
   workspace `package.json`, `CITATION.cff`, and the newest release heading in
   `CHANGELOG.md`, and it names every file that disagrees.
6. Run `pnpm gate`.
7. Tag and push: `git tag vX.Y.Z && git push --tags`.
8. Watch the `Deploy` workflow to the end, including the revalidate step, then
   load a changed entry page to confirm the cache picked up the new generation.

## Rollback

- Content problem: revert the offending content PR — the next sync converges
  the deployment to the reverted state.
- Function problem after the generation schema has shipped: repair forward with
  a compatibility-preserving function change. Do not redeploy a schema that
  rejects `syncMeta.pending`, generation metadata, typed tag links, or tag
  redirects already present in production.
- Catastrophic data problem: restore the latest Convex backup, then re-run
  the sync from `main`.
