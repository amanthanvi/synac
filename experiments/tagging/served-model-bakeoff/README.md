# Served-model tagging bake-off

This pilot compares GPT-5.6 Luna and Terra at `low`, `medium`, `high`,
`xhigh`, and `max` reasoning effort on the same frozen SynAc taxonomy task.

It is a **public-anchor benchmark**, not blind certification. Its 110 cases are
the five normative positive anchors and five normative hard negatives for each
of the eleven version-2 Tag contracts. Public examples can test contract
following, structured decision quality, and sensitivity to case order; they
cannot estimate unseen-corpus accuracy.

Version 1 is preserved under `invalid-contract-v1/` and is ineligible for model
selection. It exposed two contradictory anchors: the compiled
`command-and-control` Entry is a non-cyber military definition, while
`capability-vulnerability-management` substantively identifies CVEs. Version 2
replaces them with `fallback-channels` (positive Threats and adversary behavior)
and `vulnerability-assessment-and-management` (hard-negative NICE work wrapper).

## Frozen decision task

For every case, return two independent decisions, one in the supplied order and
one after processing the cases in exact reverse order:

```json
{
  "caseId": "opaque id from input.json",
  "passA": {
    "verdict": "applicable | not_applicable | abstain",
    "confidence": 0,
    "ruleIds": ["include:1"],
    "evidenceSenseKeys": ["source:sense"]
  },
  "passB": {
    "verdict": "applicable | not_applicable | abstain",
    "confidence": 0,
    "ruleIds": ["exclude:1"],
    "evidenceSenseKeys": ["source:sense"]
  }
}
```

Each raw result records the exact model family and effort, benchmark hash,
start/end timestamps, and all 110 case records. The model may read only
`input.json`; `expected.json` is evaluator-only. Because both files and the
taxonomy resolution are in the shared repository, this is a procedural
boundary rather than tamper-proof secrecy.

The top-level result `schemaVersion` is `synac-served-model-result-v2`.

Ranking is lexicographic: full contract validity (including semantic rule and
evidence citations), balanced accuracy, macro-F1, minimum per-Tag balanced
accuracy, abstention rate, mirror flip rate, then elapsed time. A more expensive
effort is retained only for a measured quality or stability gain. Actual API
token usage is required for dollar-cost results; agent-session wall time is only
a pilot latency signal.

## Operating cadence

Served inference is offline and event-triggered, never request-time or a
standing scheduled service. Run incrementally for new or materially changed
Entries. Require a reviewed full rerun only for a taxonomy, rubric, prompt,
schema, aggregation, calibration, or selected-model generation change.
Explicit drift/audit decisions may trigger an additional one-off run. Persist
content hashes and accepted assignments so unchanged Entries are not relabeled.

For noninteractive corpus work, prefer the OpenAI Batch API once a configuration
passes qualification. It supports these models, is designed for classification
and evaluation workloads, costs 50% less than synchronous requests, and has a
24-hour completion window.

## Rebuild

```powershell
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/build-benchmark.ts
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/score-results.ts
```

## Raw OpenAI Batch run

The Batch harness reads `OPENAI_API_KEY` only from its process environment. Do
not persist the key in this directory or include it in generated artifacts.

```powershell
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/openai-batch.ts prepare
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/openai-batch.ts smoke
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/openai-batch.ts submit
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/openai-batch.ts status
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/openai-batch.ts collect
corepack pnpm --filter @synac/content-tools exec tsx ../../experiments/tagging/served-model-bakeoff/score-results.ts --api
```

`prepare` is deterministic and requires no credential. `smoke`, `submit`, and
`status` require a process-scoped credential. Two 10-line Batches evaluate every
Luna/Terra effort twice: once in benchmark order and once in reverse order.
OpenAI Batch requires one model per Batch, so Luna and Terra have separate
transport files and Batch IDs. `collect` refuses incomplete batches and
preserves response/request IDs, exact usage, Batch cost, and raw-response hashes
without storing the credential.
