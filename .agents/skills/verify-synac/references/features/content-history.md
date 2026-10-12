# Content history

Checks that `content/tag-assignments.json` history still chains from a git base ref.

## Sub-features

- unchanged: prints `tag assignment history ok:` when the file matches the base
- changed: validates `previousAssignmentsHash` when the file differs from the base

## How to get to it (user POV)

A maintainer runs `pnpm content:history` before a content PR. CI runs it inside `pnpm gate`.

## Driving it with the CLI

`pnpm verify:drive` runs it. Smoke skips it.

```bash
pnpm content:history
```

Stdout contains `tag assignment history ok:` and the path `content/tag-assignments.json`. Log: `cli-content-history.log`. A non-zero exit fails the drive.

## Gotchas

- The default base is the merge base of `HEAD` and `origin/main`. When that ref is missing, the command falls back to `HEAD`, the diff is empty, and it still prints the ok line. That pass does not prove history against `origin/main`.
- `--base <ref>` overrides the base. A missing value is an error: `--base requires a Git ref`.
- This command reads git. It does not write assignments.
