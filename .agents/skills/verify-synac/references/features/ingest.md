# Ingest

Regenerates `content/generated/<source>.json` from an upstream document.

## Sub-features

- one source: `pnpm ingest -- --source rfc4949`
- all sources: `pnpm ingest -- --all`
- usage: no arguments exits 1 and prints `usage: ingest --source <slug> | --all`
- missing source: `--source not-a-source` prints `no source registry file` and exits 1

## How to get to it (user POV)

A maintainer, or the weekly ingest workflow, regenerates a bundle and opens a PR when bytes change. Readers see the new definitions only after that bundle is merged and synced.

## Driving it with the CLI

`pnpm verify:drive` runs the local rejection checks and one isolated RFC fetch.

Usage, from the repo root:

```bash
pnpm --filter @synac/ingest-tools ingest
```

Exit 1. Stderr contains `usage: ingest`.

Unknown source, against a scratch content dir:

```bash
pnpm --filter @synac/ingest-tools ingest -- --source not-a-source
```

Exit 1. Output contains `no source registry file`.

Live fetch, isolated so the repo bundle cannot change:

```bash
dir=/tmp/synac-verify-<hash>/ingest-content
mkdir -p "$dir/sources" "$dir/generated"
cp content/sources/rfc4949.json "$dir/sources/"
cp content/generated/rfc4949.json "$dir/generated/"
SYNAC_CONTENT_DIR="$dir" pnpm --filter @synac/ingest-tools ingest -- --source rfc4949
```

A finished run prints `rfc4949: unchanged` or `rfc4949: updated` and leaves `$dir/generated/rfc4949.json` in place. Hash `content/generated/rfc4949.json` before and after. The repo file stays the same.

If the network is unreachable, record `INCONCLUSIVE` and keep the log `cli-ingest-rfc4949.log`. The drive still exits 0. Classification uses only the last unindented error and an explicit cause line such as `[cause]:`. The name must end in `Error` or `Exception`. A `warning:` line is not an error. A line that is only braces or punctuation is not an error, so the closing `}` of a Node fetch dump does not hide `ENOTFOUND`. A later `RangeError`, `ZodError`, `IngestError`, `[Error: ...]`, or unprefixed message wins over an earlier `TypeError: fetch failed`. Indented stack frames are ignored, so `ENOTFOUND` in a frame does not make a parser error inconclusive. The ingest CLI prints `✗ <source>: fetch failed` with no `TypeError` prefix, and that line is inconclusive when it has no HTTP status. Any HTTP status is a failure. A parser error is a failure even when an earlier retry mentions a network error. Any other non-zero ingest fails the drive. The usage and missing-source checks still have to pass on the way to the live fetch.

## Gotchas

- `--all` walks every source and will try the network for each. The sweep uses `rfc4949` only.
- A run with `SYNAC_CONTENT_DIR` unset writes `content/generated/` in the repo. The helper always sets the variable for the live fetch.
- `unchanged` means the new bundle compared equal to the previous file. Confirm the isolated file still exists. The word alone is not the side effect.
- A blocked host or a DNS failure is `INCONCLUSIVE` when the final thrown error and its cause are a network failure with no HTTP status. Any HTTP status is a failure. An earlier retry line does not change the class of the final error. Do not vendor a fake RFC into product content to force a pass.
