# About

A static explanation of how entries are structured and maintained.

## Sub-features

- page: `/about`, heading `About SynAc`

## How to get to it (user POV)

Header link `About`, footer link `About`, or the palette row `About`.

## Driving it with Playwright

`drive.spec.ts` test `about page`.

Open `/about` and expect the heading `About SynAc`. Screenshot `about.png`.

## Gotchas

- The page is prose. A proof is the heading plus a visible paragraph, not a screenshot of the hero alone.
- There is no form and no write. An empty dataset does not blank this page.
