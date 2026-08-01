---
name: SynAc — public web app
description: A dictionary for security practitioners, typeset like one.
colors:
  paper: "#faf9f7"
  surface: "#ffffff"
  surface-recessed: "#f1efec"
  ink: "#211f1c"
  ink-muted: "#6c675f"
  ink-subtle: "#6e695f"
  hairline: "#e8e5e0"
  hairline-hover: "#d5d1ca"
  hairline-strong: "#c6c1b8"
  action-blue: "#2563eb"
  action-blue-hover: "#1d4ed8"
  citation-green: "#047857"
  danger: "#b91c1c"
  warn: "#a16207"
typography:
  headword:
    fontFamily: "Geist Sans"
    fontSize: "2.375rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  page-title:
    fontFamily: "Geist Sans"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  lede:
    fontFamily: "Geist Sans"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Geist Sans"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  ui:
    fontFamily: "Geist Sans"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Geist Sans"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.54
  fine:
    fontFamily: "Geist Mono"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
components:
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  badge:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "999px"
    height: "22px"
    padding: "0 8px"
---

# Design System: SynAc public web app

As-built record. Product truth lives in `apps/web/PRODUCT.md`; this file is strictly visual. Token source of truth: `src/app/globals.css`. Direction contract, verbatim from its header:

```
THESIS: A dictionary for security practitioners, typeset like one. Entries
read as reference prose with numbered senses; refuses the card-grid app
shell and monospace-as-technical-costume.
OWN-WORLD: One sans (Geist) carries every role through size and weight;
mono appears only for code, slugs, URLs, and keys. Warm-tinted neutrals
(paper-warm light, lamp-warm dark), hairline borders, one restrained blue
for links and actions. Boxes give way to whitespace and hairlines.
STORY: A practitioner lands mid-task, sees the headword and its senses
instantly, picks the right meaning, checks the source, leaves satisfied.
FIRST VIEWPORT (entry): headword block — title, quiet type marker,
expansions — then sense 1 at reading measure. Search is one ⌘K surface.
FORM: Reference canon (MDN + Vercel Docs + dictionary) played straight;
user-pinned, no seed roll.
```

## Overview

**Creative North Star: "A dictionary, typeset like one."** Reference-grade quiet: whitespace and hairline dividers instead of cards, one typeface at many sizes, one blue for anything actionable. The tool disappears into the lookup.

**Key characteristics:** rows not cards · hairlines not boxes · one search surface · numbered senses · provenance always visible.

## Colors

Warm-tinted neutrals with a single blue accent; frontmatter holds the light palette (system default). Dark is tuned separately, not inverted (`globals.css`):

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg-0` | #faf9f7 | #151312 | page (paper / lamp-warm) |
| `--bg-1` | #ffffff | #1d1b19 | raised surfaces (inputs, overlays) |
| `--bg-2` | #f1efec | #262320 | recessed / hover fills |
| `--fg` | #211f1c | #ece9e4 | primary text |
| `--fg-muted` | #6c675f | #a49d93 | secondary text (summaries, ledes) |
| `--fg-subtle` | #6e695f | #8b857b | tertiary (meta, labels, type markers) |
| `--border` / `-hover` / `-strong` | #e8e5e0 / #d5d1ca / #c6c1b8 | #2f2c28 / #3d3934 / #4b463f | hairlines |
| `--accent` / `-hover` | #2563eb / #1d4ed8 | #85acf8 / #a3c1fa | links, actions, focus, `--mark-bg` |
| `--accent-2`, `--success` | #047857 | #34d399 | secondary/status green |
| `--danger` / `--warn` | #b91c1c / #a16207 | #f87171 / #fbbf24 | status |

Contrast intent: WCAG AA — 4.5:1 floors for text in both themes (commitment recorded in PRODUCT.md; dark accents are lightened, not reused).

**The One Blue Rule.** `--accent` is the only action color on public pages; green/red/amber are status-only.

**The Legacy Alias Rule.** `--bg0`, `--bg1`, `--bg2`, `--muted`, `--accent2`, `--font-serif`, `--shadow`, `--shadow-tight` exist solely so `/admin` keeps rendering. Never use them in new public code; use the hyphenated tokens.

## Typography

**Everything:** Geist Sans. **Mono:** Geist Mono — only code, slugs, URLs, `kbd`, error digests (`--font-mono`; both self-hosted via `geist/font` variables on `<html>` in `src/app/layout.tsx`). No serif, no display face, no monospace-as-costume.

Fixed-rem scale, ~1.2 ratio, each size paired with a line-height token: `--text-xs` 12px (fine print, kbd) · `--text-sm` 13px (meta, labels) · `--text-ui` 14px (controls, nav) · `--text-body` 16px/1.7 (prose) · `--text-lg` 18px (ledes, row titles) · `--text-xl` 20px (h3/sense headings) · `--text-2xl` 24px (h2) · `--text-3xl` 30px (page titles) · `--text-4xl` 38px (headwords). Weights 400/500/600 only; headings get `--tracking-tight` (-0.015em). Reading measure `--measure: 70ch` caps all prose, summaries, and ledes.

**The Weight-Not-Face Rule.** Hierarchy comes from size and weight of one sans, never from a second family.

## Layout

- Shell: `PageShell` centers `--page-max` 1200px with `--page-pad-x` 20px; sticky `SiteHeader` (blurred `--bg-0` at 86%, hairline bottom) above `<main>`, `SiteFooter` below. Skip link (`.srOnly`) is first focusable.
- Content column: most pages wrap in `layoutStyles.pageNarrow` = `--content-max` 768px, centered (`src/app/_styles/Layout.module.css`).
- Entry layout (`_styles/Entry.module.css`): the 768px column never moves; the sense TOC (`StickySenseToc`, 220px) sits in an absolutely-positioned right margin rail at `calc(100% + 48px)`, sticky at top 76px, hidden below 1280px. Rendered only when an entry has ≥3 senses.
- Browse pattern (terms/acronyms, `src/app/terms/page.tsx`): `PageHeader` → letter index (`_styles/Browse.module.css` `.letters`) → `BrowseControls` → `EntryRowList` → `Pagination`. Tags/sources/recent/search follow the same header-then-list shape.
- Spacing: 4/8/12/16/24/32/48/64 (`--space-1..8`). Nav collapses to `MobileNav` ≤920px; row meta reflows to its own line under the title ≤560px; TOC rail hides ≤1279px.
- Theme: inline nonce'd script in `layout.tsx` applies `data-theme` from localStorage `synac-theme` before paint; no attribute = system `prefers-color-scheme`. `ThemeToggle` cycles system/light/dark. Both `html[data-theme=...]` blocks and the media query carry full palettes.
- Reduced motion: global `prefers-reduced-motion` kill switch in `globals.css` (animations/transitions to 0.01ms, skeleton goes static).

## Elevation & Depth

Flat by doctrine. **The Overlay-Only Shadow Rule:** `--shadow-sm`/`--shadow-md` appear only on floating layers — SearchPalette dialog, MobileNav panel, EntryPreviewLink tooltip, focused skip link. In-flow content is separated by hairlines and whitespace, never by shadow or card chrome.

## Shapes

Radii: 6/8/10/14px (`--radius-sm/md/lg/xl`). Controls and list-item hovers use `md`; tooltips/panels `lg`; the palette dialog `xl`; chips and Badge are full pills (999px). Borders are always 1px hairlines (`--border`, darkening to `-hover`/`-strong` on interaction). Links underline with `text-underline-offset: 3px` and a muted decoration color that strengthens on hover. Text selection and `mark` tint with `--mark-bg` (accent at 16%/24%).

## Components

All in `src/components/` unless noted. Every interactive surface has hover + `:focus-visible` (global 2px accent outline) states; lists render explicit empty states; entry routes ship `loading.tsx` skeletons (`.skeleton` shimmer).

- **SiteHeader + NavLinks** — sticky blurred bar: brand, primary nav (hover `--bg-2` fill; current page = `--fg` + weight 500 + `aria-current`), then SearchPalette trigger, ThemeToggle, MobileNav.
- **SearchPalette** — *the single suggestion surface.* Opens via ⌘K, `/` (outside editables), or clicking the header trigger (styled as a quiet 200px search field with mono `⌘K` kbd). Portal overlay, 600px `radius-xl` dialog; empty query lists "Go to" nav items; queries fetch `/api/v1/search` (150ms debounce, 8 results) with a "Search for X" row first. Full combobox/listbox a11y, arrow keys + Enter, focus held in the input.
- **SearchForm** — plain GET form to `/search` (home hero `lg`, search page). Never grows live suggestions; that belongs to SearchPalette only.
- **MobileNav** — ≤920px hamburger opening a portal dialog with focus trap, Escape, body scroll lock.
- **ThemeToggle** — icon-only button cycling system/light/dark, synced via `useSyncExternalStore` + storage events.
- **EntryRow / EntryRowList** — *the dictionary row idiom* and the default way to list entries. Hairline-separated rows (top rule on first), 18px medium title (hover → accent), inline TypeMarker, right-aligned meta, 2-line-clamped muted summary at `--measure`. Rows, not cards.
- **PublicEntryPage** (+ `_styles/Entry.module.css`) — headword block (38px title + TypeMarker baseline-aligned, "stands for" expansions, also-known-as, lede, tags/updated meta line, hairline below); then a flat `<ol>` of senses. Sense numbers (tabular, subtle) render only when >1 sense; each sense: optional heading, definition, left-ruled Examples, per-sense **Sources** (accent-linked source name, doc title, quoted/paraphrased/summarized + accessed date, license/attribution notes). Lede is suppressed when it duplicates a sole sense's definition (prefix/equality check). Relations render as EntryPreviewLinks after a hairline. Deep links `#sense-<id>` with 84px scroll margin.
- **StickySenseToc** — "On this page" rail; IntersectionObserver + hashchange drive the active item.
- **EntryPreviewLink** — underlined link with a hover/focus-within tooltip card (title + TypeMarker + 3-line summary); one of the few sanctioned boxes.
- **PageHeader** — 30px semibold title + optional muted subtitle; `badge` prop is deprecated and unrendered.
- **Pagination** — Prev / "Page N" / Next; absent directions render at 0.45 opacity with `aria-disabled`.
- **BrowseControls** — filter-within-index input (260ms debounced `router.replace`), sort select, pill tag-filter row; all state lives in the URL.
- **TagDirectory** — client-filtered tag list reusing the hairline-row idiom (`_styles/Tags.module.css`).
- **Markdown** — sanitized react-markdown (element allowlist, `skipHtml`, http/https/mailto-only URLs); inline code = mono on `--bg-2`.
- **ui/TypeMarker** — the dictionary part-of-speech idiom: lowercase "term"/"acronym" in 12px `--fg-subtle`. Plain inline text — never a filled pill, border, or background.
- **ui/Button, ui/Badge, ui/Panel, ui/KeyValue** — primitives. Button: ghost default (hairline, `--bg-1`, 36px; `sm` 30px), primary = ink fill (reserved for real actions, e.g. error-page retry). Badge (pill) and Panel (bordered `radius-lg` box) are admin-leaning; boxes are reserved for overlays and admin, so avoid Panel in public reading surfaces.

## Do's and Don'ts

### Do:
- **Do** list entries as EntryRows with hairline separators; reach for `pageNarrow` (768px) and `--measure` (70ch) on every reading surface.
- **Do** route all suggestion/autocomplete behavior through SearchPalette; other inputs stay plain GET forms or URL-state filters.
- **Do** keep both palettes updated together (media query + both `data-theme` blocks) and cover hover, focus-visible, empty, loading, and error on anything new.

### Don't:
- **Don't** use cards/boxes for in-flow content, shadows outside overlays, or filled pills for entry types (TypeMarker is plain text).
- **Don't** use mono outside code/slugs/URLs/kbd, or legacy aliases (`--bg0`, `--muted`, `--accent2`, `--font-serif`, `--shadow`) in public code.
- **Don't** restyle out-of-scope surfaces: `/admin` keeps the legacy card classes in `_styles/Browse.module.css` (marked "still consumed by admin and Phase-5 pages") and the ui primitives as-is; Clerk `SignIn`/`SignUp` render unstyled.
