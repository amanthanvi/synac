# Contributing: public web UI

SynAc's public site lives in `apps/web` (Next.js App Router).

This repo is intentionally conservative about which areas are easy to
contribute to. Most contributions should stay within the public web surface.

## Safe areas to change

- Public routes: `apps/web/src/app/**`, excluding `apps/web/src/app/api/**`.
- Shared components: `apps/web/src/components/**`.
- UI primitives, preferred for shared styling: `apps/web/src/components/ui/**`.
- Design tokens: `apps/web/src/app/globals.css`.

## Shared primitives

Use the primitives under `apps/web/src/components/ui/` instead of writing
one-off markup. Entry lists render through `EntryRow`. Type badges render
through `TypeMarker`. If a primitive is close but not quite right, extend the
primitive rather than forking it into a new component.

## Data access

Pages and route handlers reach Convex only through the helpers in
`apps/web/src/lib/convex.ts`. Do not construct a Convex client anywhere else.
Do not call Convex from client components. The service key must never reach
the browser, and the helpers are the only place that boundary is enforced.

## Styling rules

- CSS Modules only (`*.module.css`).
- No Tailwind, styled-components, or similar.
- Prefer updating existing primitives over inventing new one-off patterns.

## TypeScript rules

- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
- Keep changes small and readable. Coordinate large refactors in an issue
  first.

## Accessibility

The target is WCAG 2.2 AA. Every UI change is held to it. Work through this
checklist before opening a PR:

- Every interactive control is reachable and operable by keyboard.
- Every focusable element shows a visible focus ring.
- Headings form a single ordered outline with exactly one `h1` per page.
- Images and icons carry text alternatives, or are marked decorative.
- Color contrast is at least 4.5:1 for body text, and at least 3:1 for large
  text and for UI boundaries such as borders and focus rings.
- `prefers-reduced-motion` is honored. Motion is reduced or removed when the
  user asks for that.
- Every form control has an associated label.
- Live regions announce async results, so screen reader users hear what
  changed.

The e2e suite runs an axe scan. Serious and critical findings fail the build.

## UX expectations

For UI PRs, include:

- Desktop screenshot
- Mobile screenshot
- Accessibility notes covering keyboard, focus, and color contrast

## Run locally

Follow `docs/contributing/local-dev.md`.

## Run the end-to-end tests

Bring up the full local stack first. `docs/contributing/local-dev.md` has the
exact commands. Once the built web app is serving on port 3000, run:

```sh
E2E_BASE_URL=http://localhost:3000 pnpm --filter @synac/e2e test:e2e
```

The suite is Playwright plus axe, and it runs on chromium only.
