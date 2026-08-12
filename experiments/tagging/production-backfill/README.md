# Production tag backfill

One-off, offline classification of the compiled SynAc corpus. The selected
served candidate is `gpt-5.6-terra` at `max` effort. Two OpenAI Batch passes
reverse both Entry and Tag order. Only matching, evidence-valid `AUTO`
decisions with confidence at least 98 advance to adversarial review. A model
disagreement never writes content.

The credential is read only from `OPENAI_API_KEY`. Request/response JSONL is
ignored; durable manifests bind it by SHA-256. This is event-triggered, not a
scheduled job. Corpus or rubric changes require a new generation.

API generation v1 used 20 Entries per request. It completed at the provider but
634 of 672 responses exhausted the 16,000 combined output/reasoning-token
ceiling, so it emitted no candidates. API generation v2 was stopped after the
owner moved inference to the ChatGPT subscription. The active `codex-v1`
generation restores 20-Entry chunks and runs Terra Max through `codex exec`;
API submission is mechanically disabled for this generation.

```powershell
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/production-backfill/openai-batch.ts prepare
corepack pnpm --dir tools/content exec tsx ../../experiments/tagging/production-backfill/codex-cli.ts --limit 1 --concurrency 1
corepack pnpm --dir tools/content exec tsx ../../experiments/tagging/production-backfill/codex-cli.ts --concurrency 4
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
`local-review-progress-v4.jsonl`, and resumes that deterministic call sequence.
The earlier v1-v3 progress files are retained as forensic ledgers; their schema
smokes produced invalid abstentions or non-percent confidence and are never
loaded by the v4 runner. V4 supplies explicit rule ID/text objects and pins each response tuple
to the candidate's exact rule IDs, local index, evidence sense keys, and
verdict-dependent evidence requirements. Confidence is constrained to 75,
90, 95, 98, or 100 for sourced decisions and exactly 0 for ABSTAIN. Before a full run, use
`local-review.ts --smoke-role granite-inclusion` and then
`local-review.ts --smoke-role gemma-exclusion`; both isolated smokes must report
at least one valid call and never write the resumable production ledger.
It refuses production-manifest, compiled-corpus, rubric, candidate, or Ollama
identity drift. `reviewed-candidates.json` accepts a candidate only when both
fixed reviewer roles return evidence-valid `SUPPORT` at confidence 90 or
higher without suspected prompt injection. Delete neither artifact during an
active run; changed inputs require a fresh output location.

Finalized `expanded-source-controls/*.json` files may supplement coverage only
after disjoint primary and secondary source review. Drafts are ignored. The
emitter revalidates each finalized row against the live corpus and frozen
rubric, rejects duplicates across every source-control set, recomputes the
serving entry hash, and admits positive rows at score 1.0. This supplement does
not lower either Terra or local-review thresholds.

If the frozen local-dual lane misses the release coverage floor,
`recovery-source-controls/*.json` may add only separately adversarially reviewed
source evidence. Recovery drafts are ignored, and finalized rows pass the same
live-source, rubric, reviewer, duplicate, serving-hash, and provenance gates as
the base and expanded controls. Recovery evidence never changes a model score or
threshold.

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
