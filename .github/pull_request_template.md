## What

Closes #

What does this change do?

## Why

Why is this the right change?

## How to test

- Commands run (for example `pnpm gate`):
- Manual steps (if any):

## Screenshots (UI changes)

- Desktop:
- Mobile:

## Checklist

- [ ] Tests added or updated, or not needed
- [ ] `pnpm gate` passes locally
- [ ] Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, ...)
- [ ] Docs updated (`README.md`, `docs/**`, `content/README.md`) if behavior changed
- [ ] No secrets committed; `.env*` stays untracked and placeholders only

### Accessibility (UI changes)

- [ ] Every new control is reachable and operable by keyboard
- [ ] Focus stays visible on every focusable element
- [ ] Headings form one ordered outline with a single `h1`
- [ ] Images and icons carry text alternatives, or are marked decorative
- [ ] Contrast meets 4.5:1 for body text and 3:1 for large text and UI boundaries
- [ ] `prefers-reduced-motion` is honored by any new animation
- [ ] `pnpm --filter @synac/e2e test:e2e` passes against a local stack

### Content changes

- [ ] `pnpm content:check` run locally and passing
- [ ] No hand edits under `content/generated/`; bundles regenerated with `pnpm ingest`
- [ ] For a new source: license terms, `contentMode`, attribution requirements, and the public license statement are all filled in
- [ ] Every new or changed definition carries a citation
