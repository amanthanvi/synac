# Pull Request

## Summary
Briefly describe the purpose and context of this change. What problem does it solve and why now?

## Related issues
- Closes #...
- Relates to #...

## Changes
- ...
- ...
- ...

## Screenshots
If UI changes were made, include before/after screenshots or a short video/gif.

## How to test locally
1. nvm use (respects [.nvmrc](.nvmrc))
2. npm ci
3. npm run lint
4. npm run typecheck
5. npm run test:unit
6. npm run e2e
7. npm run test:offline

## Checklist

Quality
- [ ] Lint passes: `npm run lint`
- [ ] Typecheck passes: `npm run typecheck`
- [ ] Unit tests + coverage meet thresholds: `npm run test:unit`
- [ ] E2E tests pass: `npm run e2e`
- [ ] Offline determinism validated: `npm run test:offline`

Security
- [ ] No secrets committed; `.env*` and local secrets are ignored by VCS
- [ ] Data output is escaped and sanitized where applicable (e.g., search results rendering)
- [ ] Dependencies audited: `npm audit` (patch-only, non-breaking if updated)

Documentation
- [ ] README updated where relevant ([README.md](README.md))
- [ ] Follows Conventional Commits in all commit messages

Release
- [ ] No data migrations required / documented if needed
- [ ] Rollback plan documented (see below)

## Deployment/CI
- CI should run lint, typecheck, unit (with coverage), build, and e2e.
- If any CI job is flaky or expected to fail, justify here with links to the failure and the tracking issue.

## Rollback plan
Describe how to revert this change if necessary and steps to mitigate impact.

## Additional context for reviewers
Notes for reviewers (edge cases, trade-offs, follow-ups).

<!--
Tips:
- Keep PRs focused and small when possible.
- Link to logs or CI runs when referencing behavior.
- Add GIFs/screenshots for UX-visible changes.
-->