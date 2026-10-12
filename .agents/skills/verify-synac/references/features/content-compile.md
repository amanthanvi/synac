# Content compile

Compiles `content/` and writes the dataset to disk.

## Sub-features

- emit: `pnpm content:compile` (the `check` script with `--emit`)
- file: `tools/content/dist/compiled.json`

## How to get to it (user POV)

A maintainer runs it when they need the compiled JSON locally. The web app does not read this file. Sync reads the compiler in process.

## Driving it with the CLI

`pnpm verify:smoke` runs compile after content check.

```bash
pnpm content:compile
test -s tools/content/dist/compiled.json
```

Stdout contains `compiled dataset written to tools/content/dist/compiled.json`. The JSON has `contentVersion` starting with the 12 hex characters from the `content ok:` line, and `entries` is a non-empty array. Log: `cli-content-compile.log`.

`dist/` is gitignored. Leave the file in the working tree. Do not commit it.

## Gotchas

- A failed check exits before the write. If the file already existed from an older run, a failed compile does not prove the new run wrote it. Compare `contentVersion` to the log line from the same run.
- The path is fixed. `SYNAC_CONTENT_DIR` changes the input directory and still writes `tools/content/dist/compiled.json` under the repo.
- Compile does not push to Convex. Search staying empty after compile means sync has not run.
