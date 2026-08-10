# Releasing SynAc

Deployment is continuous: every push to `main` triggers the `Deploy` workflow,
which runs the complete repository gate, deploys the Convex functions, syncs
the compiled content, and waits for stale-row pruning to converge. A failed
gate or non-convergent sync never reports a successful content deployment.
Vercel builds the web app from `main` independently.

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

- `CONVEX_DEPLOY_KEY` — production deploy key from the Convex dashboard
  (Deployment settings → Deploy keys).

Convex production deployment environment variables:

- `SYNAC_CONVEX_SERVICE_KEY` — random secret shared with the web server.

Vercel environment variables (see `.env.example`):

- `NEXT_PUBLIC_CONVEX_URL`, `SYNAC_CONVEX_SERVICE_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `SYNAC_SESSION_HASH_SALT`, `SYNAC_RATE_LIMIT_SALT`.

## Cutting a versioned release

1. Ensure CI is green on `main`.
2. Update `CHANGELOG.md` (canonical) and mirror the entry in
   `apps/web/src/lib/changelog.ts`.
3. Bump `version` in the root and workspace `package.json` files.
4. Tag: `git tag vX.Y.Z && git push --tags`.

## One-time GitOps cutover (from the pre-content-as-code deployment)

Performed once when this architecture first ships:

1. Export the old production data: `npx convex export --prod --path snapshot.zip`
   (or download a dashboard backup) and keep it as the rollback artifact.
2. Bootstrap `content/` from the snapshot:
   `pnpm --filter @synac/content-tools exec tsx src/bootstrap-from-export.ts <extracted-snapshot-dir>`
   then review, run `pnpm content:check`, and commit.
3. Clear the old tables (dashboard → Data → clear, or restore an empty
   backup) — the new schema cannot validate rows from the old one.
4. Merge to `main`; the deploy workflow pushes the new schema + functions and
   syncs the content in.
5. Verify: `/`, an entry page, `/search?q=…`, `/sources`, and
   `npx convex run sync:status --prod`. `pending` must be absent,
   `prunePending` must be `false`, and the reported `contentVersion` must equal
   the locally compiled version.
6. Decommission Clerk (delete the application) and remove Clerk env vars from
   Vercel.

## Rollback

- Content problem: revert the offending content PR — the next sync converges
  the deployment to the reverted state.
- Function problem after the generation schema has shipped: repair forward with
  a compatibility-preserving function change. Do not redeploy a schema that
  rejects `syncMeta.pending`, generation metadata, typed tag links, or tag
  redirects already present in production.
- Catastrophic data problem: restore the latest Convex backup, then re-run
  the sync from `main`.
