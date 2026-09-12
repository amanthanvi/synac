# Content and licensing policy

SynAc publishes third-party sourced content with explicit attribution and
provenance. The project's MIT license covers the code, not the ingested
content.

## Principles

- Prefer authoritative sources (standards bodies, reputable orgs, primary documentation).
- Preserve attribution: users should be able to trace claims back to sources.
- Respect license requirements (attribution, share-alike, restrictions, etc.).

## Content modes

Each file in `content/sources/*.json` carries a `license.contentMode` field.
It declares how the site is allowed to present that source's wording. There
are three values.

`QUOTED` means the site shows the source wording verbatim, inside quotation
marks, with the citation next to it. The reader sees exactly what the source
said.

`SUMMARIZED` means the site shows an editorial summary written for SynAc, with
the source cited as the basis. No source wording is reproduced.

`PARAPHRASED` means the site shows restated wording derived from the source
and cited to it, without reproducing the original sentences.

The rule for share-alike sources is fixed. A share-alike source, for example
one under CC BY-SA 4.0, is always `QUOTED`. The quoted text stays under the
source's license and is attributed as such. Summaries and paraphrases are
derived works that would carry the share-alike terms into the SynAc editorial
layer, which is not an outcome the project accepts.

A generated bundle can only ever carry source wording, so the compiler rejects
bundle senses from a source that declares `SUMMARIZED` or `PARAPHRASED`. Those
modes are for senses a maintainer writes by hand in `content/overrides/`.

## Public statement

Each source also carries `license.publicStatement`. It is a short sentence
that the site renders on the source page and next to attestations drawn from
that source. It names the license and the attribution the source requires.

A maintainer writes the public statement by hand. It is not generated from the
license URL or from any other field. Treat a change to it as a licensing
decision, not a copy edit.

## What contributors should and should not do

Good contributions:

- Report an incorrect or unclear entry with citations, using the "Content correction" issue template.
- Suggest improved wording that is clearly your own, plus a source that supports it.
- Add documentation that explains how SynAc handles provenance and attribution.

Not acceptable:

- Copying large chunks of copyrighted text into the repo.
- Adding a source without understanding its license and terms.
- Removing attribution or provenance behavior.

## Source requests

If you want to propose a new source, open a "Source request" issue. Include:

- the source URL,
- the license or terms URL, and which license type it is,
- what uses the license allows,
- what attribution the license requires,
- a contact for the source owner or maintainer,
- any robots.txt or rate-limit restrictions on automated access,
- why the source is valuable,
- and how it can be accessed (HTML, PDF, CSV, API, etc.).

The issue template asks for the same things. Fill it in rather than opening a
blank issue.

## Takedowns and corrections

If you believe content should be removed or corrected:

- For non-security issues, open a content correction issue with sources and context.
- For security-related issues, follow `SECURITY.md`.
