# Acronyms browse

Alphabetical index of published acronyms. The controls match the term index.

## Sub-features

- letters: navigation `Acronym letters`
- filter, sort, tag chips, and paging: same parameters as terms, on `/acronyms`

## How to get to it (user POV)

Header link `Acronyms`, or `/acronyms`. The heading is `Acronyms`.

## Driving it with Playwright

`drive.spec.ts` test `acronyms browse opens BLACK`.

Open `/acronyms`, click `b` in `Acronym letters` (the letter text is lowercase), then open `/acronym/black`. The heading is `BLACK`. Screenshot `acronym-black.png`.

## Gotchas

- Letter `b` is sorted by title. `BLACK` is near the start of that letter. If a future corpus pushes it past page 1, follow pagination `Next` until the link is visible and say so.
- Empty letters use the sentence `No published acronyms yet for <letter>`.
- A hostile `letter` value falls back to A, the same way the term index does.
