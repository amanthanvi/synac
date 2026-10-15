# Legal

Privacy policy and terms of use.

## Sub-features

- privacy: `/legal/privacy`, heading `Privacy Policy`
- terms: `/legal/terms`, heading `Terms of Use`

## How to get to it (user POV)

Footer links `Privacy` and `Terms of Use`.

## Driving it with Playwright

`drive.spec.ts` test `legal privacy and terms`.

Open both URLs and expect those headings. Screenshot `legal-terms.png` is the terms page.

## Gotchas

- These pages are static prose. They do not read the glossary dataset.
- The footer label is `Terms of Use`. The header label `Terms` is the glossary index, a different page.
