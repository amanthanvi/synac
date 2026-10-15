# Content check

Validates `content/` and prints the compiled counts. It does not write a dataset file.

## Sub-features

- success: `pnpm content:check` prints `content ok:` and a short content version
- schema failure: a content dir that cannot be parsed exits non-zero

## How to get to it (user POV)

A maintainer runs it from the repo root after editing `content/`. Readers never see this command.

## Driving it with the CLI

`pnpm verify:smoke` runs this as the first CLI step. The log is `/tmp/synac-verify-<hash>/evidence/cli-content-check.log`.

```bash
pnpm content:check
```

Stdout contains `content ok:` and `(version ` plus 12 hex characters. Exit 0.

The hostile check uses a scratch directory so the repo stays untouched:

```bash
dir=/tmp/synac-verify-<hash>/hostile-content
mkdir -p "$dir"
printf '{' > "$dir/tags.json"
SYNAC_CONTENT_DIR="$dir" pnpm content:check
```

Exit is non-zero and the output contains `content check failed` or `invalid JSON`. Log: `cli-content-hostile.log`.

## Gotchas

- `SYNAC_CONTENT_DIR` redirects the read. Forget it and the command checks the real `content/` tree.
- Warnings print as `⚠` and still exit 0 when there are no errors. A proof of failure needs a non-zero exit.
- This command does not write `tools/content/dist/compiled.json`. That file is the compile feature.
