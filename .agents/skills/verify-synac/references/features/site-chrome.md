# Site chrome

The header, footer, and small-screen menu that wrap every page.

## Sub-features

- header: brand `SynAc` to `/`, navigation `Primary` with Terms, Acronyms, Tags, Sources, About
- footer: contentinfo links About, Privacy, Terms of Use, Changelog, GitHub
- mobile: below 920px the primary nav hides and button `Open menu` opens navigation `Mobile`

## How to get to it (user POV)

The chrome is on every page. Narrow the window to use the menu.

## Driving it with Playwright

`drive.spec.ts` test `header, footer, and mobile menu`.

At 1280px, navigation `Primary` shows `Terms`, and the footer link `Privacy` is visible. Resize to 390 by 844, click `Open menu`, and follow `Tags` in navigation `Mobile`. The URL ends in `/tags`. Screenshot `mobile-tags.png`.

## Gotchas

- The menu button is `display: none` above 920px. A click at desktop width does not count.
- Escape closes the mobile panel. The drive uses a link click, which also closes it.
- The GitHub footer link leaves the site. Do not follow it in the sweep.
