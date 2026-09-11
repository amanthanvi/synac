# Tag taxonomy

Tags in SynAc are a **maintained classification system**, not free-form
keywords. There is no public tagging surface: a tag exists because a maintainer
created it, and an entry carries a tag because a maintainer, the editorial
layer, or the auto-tagger put it there — each of which is recorded.

Schema: `Tag`, `TagSlugHistory`, and `EntryTag` in
`packages/db/prisma/schema.prisma`.

## Tag kinds

`Tag.kind` is the `TagKind` enum, with two members.

### `DOMAIN` — what subject area the entry belongs to

A domain answers "which part of security is this about?" An entry usually has
one to three. The seeded domain taxonomy
(`packages/db/prisma/seedContent.ts`) is:

| Slug                       | Name                     |
| -------------------------- | ------------------------ |
| `identity`                 | Identity                 |
| `access-control`           | Access Control           |
| `cryptography`             | Cryptography             |
| `network-security`         | Network Security         |
| `application-security`     | Application Security     |
| `threats`                  | Threats                  |
| `security-operations`      | Security Operations      |
| `incident-response`        | Incident Response        |
| `vulnerability-management` | Vulnerability Management |
| `cloud-containers`         | Cloud & Containers       |
| `endpoint-security`        | Endpoint Security        |
| `governance-risk`          | Governance & Risk        |
| `software-supply-chain`    | Software Supply Chain    |
| `privacy`                  | Privacy                  |
| `fundamentals`             | Fundamentals             |

### `FACET` — what kind of thing the entry is

A facet cuts across domains: it describes the nature of the entry rather than
its subject. Facets are for distinctions like "this is a standard", "this is a
protocol", "this is a control", "this is an attack technique", "this is a
regulatory framework". A single entry can be `cryptography` (domain) and
`protocol` (facet) at once, and the two answer different questions.

`kind` defaults to `DOMAIN`, so a facet is always an explicit decision. Nothing
in the seeded taxonomy is a `FACET` yet — every tag listed above is a domain.
Facets are added deliberately, one at a time, when a cross-cutting distinction
proves it earns a tag rather than a relationship.

## Hierarchy

`Tag.parentId` is a self-relation (`tag_hierarchy`). It is optional; a tag with
no parent is a root.

The hierarchy is deliberately **shallow — two levels, root and child**. A child
narrows its parent (`cryptography` → `pki`); it never re-parents across kinds,
so a `FACET` child hangs off a `FACET` root and a `DOMAIN` child off a `DOMAIN`
root. Deeper nesting is not supported by convention: past two levels the
browse UI stops being navigable and curators stop agreeing on where a tag
belongs. If a third level looks necessary, that is usually a sign the middle
tag should be split or promoted instead.

Deleting a parent sets its children's `parentId` to `NULL` (`onDelete:
SetNull`) rather than cascading — orphaning a child is recoverable, deleting it
silently is not.

## Adding, renaming, and merging a tag

All three go through `/admin` or the admin API and are written to the audit
log. There is no self-serve tag creation.

### Add

Propose it in an issue first, with the entries that would carry it. A tag that
would apply to fewer than a handful of entries is usually better expressed as a
relationship or a disambiguation note.

Creating a tag checks `tag_slug_history` first: a slug that any tag has ever
used is **reserved** and cannot be claimed by a new tag. This is what keeps old
URLs from silently pointing at unrelated content.

### Rename

Renaming writes the tag's previous slug into `tag_slug_history` before
updating, so `/tags/<old-slug>` keeps resolving. `resolveTagBySlug` looks up the
canonical slug first, then falls back to history and reports
`needsRedirect: true`, which the page layer turns into a redirect to the
canonical URL.

Slug history is append-only. A renamed tag accumulates every slug it has ever
had, and all of them redirect.

### Merge

`POST /api/v1/admin/tags/{id}/merge` with a body of
`{ "intoTagId": "<uuid>" }`. `{id}` is the tag being merged **away**; it
requires the `ADMIN` role, not just `EDITOR`.

The merge:

1. Copies every `EntryTag` link from the source tag onto the destination tag
   (duplicates are skipped, so an entry that already had both keeps one link).
2. Moves the source tag's slug — and every slug in its history — into
   `tag_slug_history` pointing at the destination tag, so every historical URL
   now redirects to the merged tag.
3. Soft-deletes the source tag.

A merge is not reversible by re-running it in the other direction: the original
per-entry provenance of the merged links is not restored. Merge deliberately,
and prefer a rename when the goal is only a better name.

## Provenance: who assigned a tag

`EntryTag.assignedBy` is the `TagAssignment` enum. Every entry–tag link carries
one, and it decides who is allowed to change or remove that link.

| Value       | Set by                                         | Removable by the auto-tagger |
| ----------- | ---------------------------------------------- | ---------------------------- |
| `EDITORIAL` | A maintainer in `/admin`, or `content/**` YAML | Never                        |
| `INGEST`    | The ingest pipeline, from source metadata      | Never                        |
| `AUTO`      | The auto-tagger, from pattern matches          | Yes — it owns these          |

The default is `EDITORIAL`, so anything written by hand is protected unless it
is explicitly marked otherwise.

## Auto-tagging policy

The auto-tagger (`syncAutoTagsForPublishedEntry` in
`packages/db/src/queries/autoTagging.ts`) runs when an entry is published and
can be re-run over the whole corpus with:

```bash
pnpm --filter @synac/db db:tag:auto
```

It reads the entry's `entry_search.search_document` — title, variants,
summary, and sense definitions — and matches it against a catalog of weighted
patterns per tag.

### Hit threshold

Each pattern carries a weight:

- **weight 1** — a generic term (`network`, `credential`, `hash`). On its own
  it is only corroboration.
- **weight 2** — a multi-word phrase or a domain-specific acronym
  (`least privilege`, `single sign-on`, `saml`). Decisive by itself.

A tag is applied only when its summed weight reaches `AUTO_TAG_THRESHOLD`
(currently **2**): either two independent generic hits, or one specific
phrase/acronym. Bare common English words are deliberately absent from the
catalog — they produced tags that matched nearly every entry and therefore
meant nothing.

### Additive-only with respect to curation

The auto-tagger only ever creates and removes links whose `assignedBy` is
`AUTO`. It reconciles its own links against the current match set — a link it
added that no longer matches is withdrawn — but:

- It **never removes an `EDITORIAL` or `INGEST` link**, even when the entry
  text no longer matches that tag's patterns. A curator's judgment outranks a
  regex.
- It **never overwrites** the provenance of an existing link. If a tag is
  already attached as `EDITORIAL`, the auto-tagger leaves it alone rather than
  re-adding it as `AUTO` — so an editorial assignment cannot be silently
  downgraded into something the auto-tagger is then free to withdraw.
- It **does not create tag rows** during a routine republish. New `Tag` rows
  are only materialized when the caller passes `ensureDefinitions: true`, which
  keeps a publish from quietly expanding the vocabulary. It also honours
  `tag_slug_history`: a slug reserved by a past tag is never re-created.

The practical rule: if you want an entry to carry a tag permanently, assign it
editorially — in `/admin` or in `content/entries/**/*.yaml`. Auto tags are a
best-effort first pass, and they are the only ones the machine is allowed to
take back.

## Related docs

- Editorial YAML schema: `docs/content/editorial-layer.md`
- Licensing of the editorial layer: `docs/content/licensing.md`
- Public tag endpoints: `docs/api.md`
