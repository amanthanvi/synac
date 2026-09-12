# Runbook: Suspected compromise

SynAc has no user accounts and no sessions, so there is nothing to sign out
and no admin surface to lock down. A compromise here means a leaked deploy
credential, a leaked service key, or an unreviewed change reaching `main`.

## Immediate actions

Rotate `CONVEX_DEPLOY_KEY`. Generate a new key in the Convex dashboard under
Deployment settings, then Deploy keys. Update the GitHub repository secret of
the same name. Revoke the old key once the new one is in place.

Rotate `SYNAC_CONVEX_SERVICE_KEY`. Pick a new random value. Set it on the
Convex deployment with `npx convex env set SYNAC_CONVEX_SERVICE_KEY <value>
--prod`. Set the same value in the Vercel project environment variables.
Redeploy both so the two sides agree, otherwise the web app cannot call the
backend.

Rotate `SYNAC_REVALIDATE_SECRET`. Set a new value in the Vercel project
environment variables and in the GitHub repository secrets. Both sides must
match or the Deploy workflow cannot refresh cached pages.

Revoke every Vercel access token that could have been exposed and reissue the
ones still needed.

Review GitHub personal access tokens with access to this repository, and
review the repository Actions secrets. Remove anything unrecognized.

## Investigation

Open the Actions tab and review recent `deploy-content` workflow runs. Look
for a run that was not triggered by a reviewed merge to `main`.

Review the git history of the content tree for unreviewed changes:

```sh
git log --stat -- content/
```

Review the Convex dashboard function logs for calls that do not match normal
site traffic.

Review the Vercel deployment history for deployments that do not correspond to
a commit on `main`.

## Recovery

The repository is the source of truth. Once the credentials are rotated, force
a full resync by pushing to `main`:

```sh
git commit --allow-empty -m "chore: redeploy"
git push
```

That runs the Deploy workflow, which redeploys the Convex functions and syncs
the full content dataset. Verify the result:

```sh
npx convex run sync:status --prod
```

Restore a Convex backup only if runtime data is damaged. Content never needs a
backup restore, because a resync from `main` rebuilds it.
