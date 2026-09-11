# Senses and meanings

A sense is one source's definition of one meaning. A meaning is the concept
itself.

Several sources usually attest the same meaning with slightly different
wording. RFC 4949 and the NIST glossary both define a DNS domain, and they do
not use the same words. Showing both as two separate senses would tell a reader
there are two concepts when there is one. So the compiler groups those senses
into a single meaning. The lead sense supplies the definition the page renders,
and every other source in the group becomes an attestation under it.

An attestation carries one other source's wording plus the citation behind it,
and that citation carries the content mode, the license, and the attribution
text. The reader sees one meaning, its primary definition, and the other
sources that agree with it stacked underneath.

## How grouping works

The compiler compares the definition text of every sense on an entry. It
lowercases the text, splits it into word tokens on any non-alphanumeric run,
and scores each pair with the Dice coefficient over the two token sets.

Senses scoring 0.8 or above merge into one meaning. The earlier sense in
source-precedence order leads, and the later one becomes an attestation.

Senses scoring between 0.5 and 0.8 are reported as near matches. The compiler
does not merge them. A maintainer confirms the match with a `groupSenses`
override, or leaves them apart.

Senses below 0.5 stay separate.

Grouping is deterministic. The same content always produces the same meanings,
so a content diff never shows churn that nobody caused.

## The needsLabel warning

The compiler emits `needsLabel` on both meanings of a near match: a pair that
scored in the 0.5 to 0.8 band and that neither side carries a label for. A
label the source itself supplies counts, so a pair where either side already
has one is never flagged.

It is a warning, not an error. It does not fail `pnpm content:check`. It is a
prompt for editorial work: a reader looking at two unlabeled meanings has to
read both definitions to find out which one they wanted.

## Fixing it with overrides

All four fields live in `content/overrides/{term,acronym}/<slug>.json`. Sense
keys are namespaced as `<sourceSlug>:<senseKey>`, the same format
`suppressSenses` uses. A meaning key is the namespaced sense key of the
meaning's lead sense: the first sense in source-precedence order, or the first
key listed in a `groupSenses` list. `pnpm content:check` prints the sense keys
next to the warnings.

`labelSenses` maps a meaning key to a short label. The label renders next to the
meaning on the entry page. Keep it to a few words.

`disambiguationNotes` maps a meaning key to one sentence explaining when a
reader wants this meaning rather than another one on the same entry. Write it
for the reader who picked the wrong meaning last time.

`groupSenses` is an array of arrays of sense keys. Each inner array names senses
the compiler left separate that should become one meaning. Use it to confirm a
near match from the 0.5 to 0.8 band. The first key in the list leads, and
the rest become attestations under it.

`splitSenses` is a flat array of sense keys. A sense listed there is never
grouped automatically, however alike its wording is to another sense on the
entry. Use it when two different concepts happen to share vocabulary. A key
cannot be in both `groupSenses` and `splitSenses`.

## Worked example: domain

`domain` carries eight senses from RFC 4949 plus one from the NIST CSRC
glossary. They cover the DNS name hierarchy, a security or administrative
boundary, a CPU operating mode, a CORBA scope, a MISSI certification authority
population, and an OSI administrative partition. Left as they arrive, each
meaning heads with the label its source gave it, such as `5 (I) /Internet/`,
which tells a reader nothing about which meaning they want.

Three of the senses (`1a`, `1b`, and `1c` in RFC 4949 numbering) all describe
the security-policy domain, but their wording differs enough that grouping left
them apart. Two others are short and generic enough that they merged when they
should not have.

`content/overrides/term/domain.json`:

```json
{
  "labelSenses": {
    "rfc4949:1a-i-general-security": "Security or administrative domain",
    "rfc4949:2-o-compusec": "CPU operating mode",
    "rfc4949:3-o": "CORBA scope",
    "rfc4949:4-o-missi": "MISSI CA population",
    "rfc4949:5-i-internet": "DNS name hierarchy",
    "rfc4949:6-o-osi": "OSI administrative partition"
  },
  "disambiguationNotes": {
    "rfc4949:5-i-internet": "Use this meaning when the domain is a DNS name such as example.com, including everything below it in the name tree.",
    "rfc4949:1a-i-general-security": "Use this meaning when the domain is a trust or policy boundary, such as a set of systems under one security policy and one administrative authority."
  },
  "groupSenses": [
    [
      "rfc4949:1a-i-general-security",
      "rfc4949:1b-o-security-policy",
      "rfc4949:1c-o-security-policy"
    ]
  ],
  "splitSenses": ["rfc4949:3-o", "rfc4949:6-o-osi"]
}
```

The `groupSenses` entry collapses the three security-policy senses into one
meaning keyed by `rfc4949:1a-i-general-security`. The other two senses become
attestations under it.

The `splitSenses` entry keeps the CORBA scope and the OSI administrative
partition out of automatic grouping. Both definitions are one terse sentence
about a bounded scope, which is enough shared vocabulary to cross the merge
threshold, but they are different concepts.

The two disambiguation notes cover the pair readers confuse most often: the DNS
name and the security boundary.

## Verifying

Run `pnpm content:check`. It prints one warning per near match that still needs
labels, with the similarity score and the override path to edit, then a count
of the entries still needing sense labels. An entry you have finished labeling
drops off that list.

Then load `/term/domain` locally. The labels render next to the meanings, and
the disambiguation notes render under them.
