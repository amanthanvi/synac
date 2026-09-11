# Contributing: public web UI

SynAc’s public site lives in `apps/web` (Next.js App Router).

This repo is intentionally conservative about what areas are "easy to
contribute to". Most contributions should stay within the public web surface.

## Safe areas to change

- Public routes (do not touch admin/API):
  - `apps/web/src/app/**` excluding:
    - `apps/web/src/app/admin/**`
    - `apps/web/src/app/api/**`
- Shared components:
  - `apps/web/src/components/**`
- UI primitives (preferred for shared styling):
  - `apps/web/src/components/ui/**`
- Design tokens:
  - `apps/web/src/app/globals.css`
- Public assets:
  - `apps/web/public/**`

## Data access rule

Public pages load data through the query loaders exported from `@synac/db`
(`packages/db/src/queries/**`): `loadEntryPage`, `listBrowseEntries`,
`listRecentEntriesPage`, `listTagEntriesPage`, `listSourceCitedEntries`, and so
on.

**Never call `getPrismaClient` from a public page, layout, or component.** This
is lint-enforced: a direct import in a public route fails `pnpm lint`.

The loaders are where the published-only filters, soft-delete handling, and
select shapes live. Reaching past them into Prisma is how a draft or archived
entry ends up on a public page. If you need data no loader exposes, open an
issue. The loader change is a `packages/db` change and needs maintainer review
(see `GOVERNANCE.md`).

## Styling rules

- CSS Modules only (`*.module.css`).
- No Tailwind/styled-components/etc.
- Colors, spacing, radii, and shadows come from the tokens in
  `apps/web/src/app/globals.css`. Do not hard-code hex values in a module.
- Prefer updating existing primitives over inventing new one-off patterns.

## Shared primitives

Reach for these before writing a new component.

### `EntryListItem` (`apps/web/src/components/EntryListItem.tsx`)

The single row shape shared by home, `/recent`, `/search`, `/terms`,
`/acronyms`, `/tags/[slug]`, and `/sources/[slug]`. It renders an `<li>`, so it
must be a child of a `<ul>`/`<ol>`.

```ts
type EntryListItemProps = {
  entryType: 'TERM' | 'ACRONYM';
  title: string;
  href: string;
  /** Right-aligned metadata: updated date, slug, result rank, and so on. */
  meta?: ReactNode;
  summary?: ReactNode;
  tags?: Array<{ id: string; name: string; slug: string }>;
  children?: ReactNode;
};
```

It renders the `TypeBadge` and the tag links itself. Do not re-add either
alongside it.

### `TypeBadge` (`apps/web/src/components/TypeBadge.tsx`)

The TERM/ACRONYM chip.

```ts
type TypeBadgeProps = {
  entryType: 'TERM' | 'ACRONYM';
  size?: 'sm' | 'md'; // default 'sm'
  className?: string;
};
```

One tinted-outline treatment everywhere, on purpose. Solid accent fills could
not hold a 4.5:1 contrast ratio against white text. Do not reintroduce a filled
variant.

### `EmptyState` (`apps/web/src/components/ui/EmptyState.tsx`)

Every list route that can return zero rows uses this. A bare "No results" is
not acceptable.

```ts
type EmptyStateProps = {
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
};
```

Say what was searched for and offer a way out (clear the filter, browse by
letter) in `actions`.

Other primitives live in `apps/web/src/components/ui/**`: `Button`, `Panel`,
`Badge`, `Pill`, `Divider`, `KeyValue`.

## Accessibility

**Target: WCAG 2.2 AA.** The e2e suite (`apps/e2e`) runs axe against public
pages, and serious or critical violations fail the build.

Checklist for every UI PR:

- **Keyboard-only path works.** Every interactive element is reachable and
  operable with Tab/Shift-Tab/Enter/Space/Escape. No keyboard traps. Dialogs and
  the command palette return focus to the trigger on close.
- **Focus is visible.** `globals.css` gives every focusable element a
  `:focus-visible` outline. Do not remove it; if a component needs a custom
  ring, it must be at least as visible.
- **Contrast is at least 4.5:1** for body text and 3:1 for large text and UI
  boundaries, in both light and dark themes.
- **Screen-reader semantics.** Real landmarks (`header`, `nav`, `main`,
  `footer`), one `h1` per page, headings in order, labels on every control,
  accessible names on icon-only buttons. Use the `.srOnly` utility for
  visually-hidden text.
- **No serious/critical axe violations.** Run the e2e suite (see
  `docs/contributing/local-dev.md`) before opening the PR.
- **Reduced motion is respected.** Wrap non-essential animation in
  `@media (prefers-reduced-motion: no-preference)`, or neutralize it under
  `@media (prefers-reduced-motion: reduce)`, as the existing modules do.
- Touch targets are at least 24x24 CSS px (WCAG 2.2 target size, minimum).

## TypeScript rules

- No TS suppression (`as any`, `@ts-ignore`, `@ts-expect-error`).
- Keep changes small and readable; avoid large refactors unless coordinated in
  an issue first.

## UX expectations

For UI PRs, include:

- Desktop screenshot
- Mobile screenshot
- Accessibility notes (keyboard path, focus, contrast, axe result)

## Run locally

Follow `docs/contributing/local-dev.md`.
