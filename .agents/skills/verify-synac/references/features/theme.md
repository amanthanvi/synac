# Theme

Cycles system, dark, and light. The choice is stored in the browser.

## Sub-features

- cycle: button name `Theme: System`, then `Theme: Dark`, then `Theme: Light`, then back to system
- persist: `localStorage['synac-theme']` and `data-theme` on `<html>`
- system: no `data-theme` attribute, so the OS preference applies

## How to get to it (user POV)

The theme button sits in the header on every page.

## Driving it with Playwright

`drive.spec.ts` test `theme cycles and survives reload`.

A fresh context starts at `Theme: System`. Click once. The name is `Theme: Dark`, `<html data-theme="dark">` is set, and `localStorage['synac-theme']` is `dark`. Reload. The attribute is still `dark`. Screenshot `theme-dark.png`.

## Gotchas

- System removes `data-theme`. Assert the attribute is absent for that state. A missing attribute is the success state.
- Storage that throws still applies the theme for the current view. The reload check is what proves persistence.
- Each Playwright test has its own context. A theme set in one test is not visible in the next.
