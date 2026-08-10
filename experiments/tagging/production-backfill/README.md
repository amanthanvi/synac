# Production tag backfill

One-off, offline classification of the compiled SynAc corpus. The selected
served candidate is `gpt-5.6-terra` at `max` effort. Two OpenAI Batch passes
reverse both Entry and Tag order. Only matching, evidence-valid `AUTO`
decisions with confidence at least 98 advance to adversarial review. A model
disagreement never writes content.

The credential is read only from `OPENAI_API_KEY`. Request/response JSONL is
ignored; durable manifests bind it by SHA-256. This is event-triggered, not a
scheduled job. Corpus or rubric changes require a new generation.

The frozen run contains 672 requests and caps each response at 16,000 combined
output/reasoning tokens. Extrapolation from the measured Terra Max Batch pilot
is about $31; the token ceiling bounds the same measured-rate exposure to about
$69 before retries or a provider price change. The submit command refuses a
second Batch ID.

```powershell
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/production-backfill/openai-batch.ts prepare
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/production-backfill/openai-batch.ts submit
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/production-backfill/openai-batch.ts status
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/production-backfill/openai-batch.ts collect
```

`collect` produces candidates, not serving assignments. The local critic and
double-check audit must pass before `content/tag-assignments.json` is emitted.

## Local adversarial review

After `collect`, install the pinned `granite3.3:8b` and `gemma3:12b` Ollama
models and run:

```powershell
corepack pnpm --dir tools/content exec tsx ../../experiments/tagging/production-backfill/local-review.ts
```

The runner reviews five Terra candidates per call, appends every attempt to
`local-review-progress.jsonl`, and resumes that deterministic call sequence.
It refuses production-manifest, compiled-corpus, rubric, candidate, or Ollama
identity drift. `reviewed-candidates.json` accepts a candidate only when both
fixed reviewer roles return evidence-valid `SUPPORT` at confidence 90 or
higher without suspected prompt injection. Delete neither artifact during an
active run; changed inputs require a fresh output location.

## Emit serving assignments

After local review completes, emit the checked-in serving schema with an
explicit destination, release ID, and timestamp:

```powershell
corepack pnpm --dir tools/content exec tsx ../../experiments/tagging/production-backfill/emit-assignments.ts --output ../../content/tag-assignments.json --run-id synac-tags-20260810 --created-at 2026-08-10T12:00:00Z
```

The deterministic diff and hash inputs are written to
`<output>.report.json`. Existing output or report files are never overwritten
without `--replace`. On replacement, the existing checked-in artifact is the
required predecessor; unchanged pairs carry forward. Drops additionally need
`--removals <file>` containing `synac-reviewed-tag-removals-v1`, bound to the
predecessor and reviewed-candidates hashes, with each row's prior/current entry
hash, reason, and new run ID. Changed entries otherwise block until freshly
accepted or explicitly reviewed for removal.

## Local challenger stop

The measured [local challenger screen](./local-challenger-results.json) stopped
Granite 3.3 8B and Gemma 3 12B at the output-contract gate: both lost, repeated,
or invented opaque case IDs in the first 10-case chunk. No repair heuristic was
applied. Terra max therefore remains selected; a future local candidate must
first produce a fresh contract-valid generation.
