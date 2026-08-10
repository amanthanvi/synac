# SynAc local and served model bake-off

**Decision memo — research only**
**Source access date:** 2026-08-09
**Scope:** sparse, offline, multi-label cybersecurity tagging; no human annotation or adjudication.

## Recommendation

Keep the already-resolved **local, evidence-bound synthetic-reference panel**
separate from the classifier candidates. Do not use Luna or Terra in a
label-producing primary, critic, arbiter, verifier, or assistant role for this
reference generation. That preserves both served models as eligible direct
classifier candidates under the model-family firewall.

The frozen role boundary is:

```text
Synthetic-reference generation              Classifier candidates
(produces frozen weak labels)                (never produce those labels)

P1 Qwen3:8b -------+                         gpt-5.6-luna  low..max
P2 Gemma3:12b -----+--> provisional labels   gpt-5.6-terra low..max
P3 Granite3.3:8b --+            |            independent local encoders
P4 Llama3.1:8b ----+            v
                         A1 Phi4-mini:3.8b
                         A2 Mistral:7b
```

The model names above are **candidate roles, not measured winners**. The first
reference qualification must determine whether each local lane passes the
frozen control, format, stability, and disagreement gates in
[AI-only adjudication](./ai-adjudication-substitute.md). A lane that fails is
replaced or remains a non-decisive challenger; it is never rescued by calling
its output correct.

Use Terra `max` as the measured served accuracy ceiling, Terra `xhigh` as the
served cost/quality candidate, and Luna `max` as the economic served challenger
for the next sealed comparison. The raw Batch pilot measured 97.7%, 96.8%, and
96.4% balanced accuracy respectively on public anchors; their two-pass Batch
costs were $0.505970, $0.250106, and $0.068863. None is eligible for AUTO from
this evidence. The anchors are public, only ten cases exist per Tag, and the
hard-negative false positives are incompatible with the 98% precision target.

Do not count Luna and Terra as independent evidence families: they are both
named GPT-5.6 models from OpenAI, and no public evidence here establishes
disjoint base-model lineage. That is an inference from the model family naming,
not a claim about undisclosed weights. The independent local encoder/head
candidates remain mandatory controls.

There is one legitimate alternative, but it is mutually exclusive with this
recommendation: Terra could serve as a held-out synthetic-label arbiter. If it
does, the firewall bars the GPT-5.6 family—including Luna—from classifier
evaluation against that reference generation. That role change requires a new
explicit decision and generation manifest.

This produces **synthetic reference labels** and explicit "unresolved" cells. It does not produce human labels, a human gold set, or ground truth. Agreement is a reliability signal only.

## Evidence boundaries

| Class                       | What is established                                                                                                                                                                                                                                                                                                                                                 | What is not established                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository/runtime evidence | The production "content/tags.json" currently has **eight** tags; the synthetic-panel protocol plans a separate 1,500-entry, 11-tag study. The six requested Ollama tags resolve locally. A 110-case public-anchor pilot covers all ten requested Luna/Terra effort configurations, followed by a uniform 20-request raw OpenAI Batch run with exact usage and cost. | Whether a given candidate accurately applies Tags to unseen SynAc Entries. Both fixtures are public and balance-disclosed; the raw Batch removes agent tools but is still development evidence, not certification. |
| First-party source claim    | OpenAI exposes the named model capabilities, prices, Batch behavior, and reasoning-effort guidance; vendor cards describe the upstream local-model architectures.                                                                                                                                                                                                   | Vendor benchmark claims do not prove performance on SynAc definitions, sparse positives, or adversarial cybersecurity text.                                                                                        |
| Design hypothesis           | A local cross-vendor panel can produce the synthetic reference while separated local-encoder and served candidates compete as classifiers.                                                                                                                                                                                                                          | Independence, calibration, semantic validity, cost/quality dominance, and reproducibility must be measured under the frozen protocol.                                                                              |

The eight-versus-eleven mismatch is a hard precondition. Do not run an "11-tag" benchmark by silently mapping it to the current eight production tags. First freeze exactly eleven stable IDs plus inclusion, exclusion, and boundary rules, or explicitly scope the benchmark to the current taxonomy.

## What the local inventory actually contains

This is measured runtime evidence, collected with "ollama --version", "ollama list", and "ollama show <tag> --modelfile" on 2026-08-09. It is not a claim that the packages exactly equal a particular upstream checkpoint. The "FROM" values are local Ollama blob identities, not vendor model-card revisions.

| Ollama tag       | List ID        |   Size | FROM blob SHA-256                                                  |
| ---------------- | -------------- | -----: | ------------------------------------------------------------------ |
| "qwen3:8b"       | "500a1f067a9"  | 5.2 GB | "a3de86cd1c132c822487ededd47a324c50491393e6565cd14bafa40d0b8e686f" |
| "gemma3:12b"     | "f4031aab637d" | 8.1 GB | "e8ad13eff07a78d89926e9e8b882317d082ef5bf9768ad7b50fcdbbcd63748de" |
| "llama3.1:8b"    | "46e0c10c039e" | 4.9 GB | "667b0c1932bc6ffc593ed1d03f895bf2dc8dc6df21db3042284a6f4416b06a29" |
| "granite3.3:8b"  | "fd429f23b909" | 4.9 GB | "77bcee066a76dcdd10d0d123c87e32c8ec2c74e31b6ffd87ebee49c9ac215dca" |
| "phi4-mini:3.8b" | "78fad5d182a7" | 2.5 GB | "3c168af1dea0a414299c7d9077e100ac763370e5a98b3c53801a958a47f0a5db" |
| "mistral:7b"     | "6577803aa9a0" | 4.4 GB | "f5074b1221da0f5a2910d33b642efa5b9eb58cfdddca1c79e16d7ad28aa2b31f" |

Ollama version was "0.32.6". Freeze all four fields above, the complete Modelfile/template, and sampler settings in each run manifest. A mutable tag such as "qwen3:8b" alone is insufficient provenance.

## Local candidate comparison

The following are upstream first-party model-card facts, not local benchmark results. "Panel role" is a hypothesis to test under the frozen contract.

| Candidate        | Upstream architecture/capability facts                                                                                                                                                                                                      | Provisional role                                                                  | Important constraint                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "qwen3:8b"       | Qwen describes Qwen3-8B as an 8.2B causal LM with 36 layers and GQA (32 query/8 KV heads), 32,768 native context and 131,072 with YaRN. It can switch thinking on or off. [Qwen model card](https://huggingface.co/Qwen/Qwen3-8B)           | Primary P1; local reasoning/non-reasoning contrast.                               | Qwen's own card advises non-greedy sampling for thinking mode. Benchmark its documented sampler separately from a reproducibility-focused configuration; do not assume temperature 0 is the best Qwen setting. |
| "gemma3:12b"     | Google describes Gemma 3 as open-weight, multimodal text/image-input and text-output; its 12B variant has 128K total input context and 8,192 output tokens. [Google model card](https://huggingface.co/google/gemma-3-12b-it)               | Primary P2; largest installed local challenger.                                   | This workflow is text-only. Its vision capability is not an advantage unless source images later enter the frozen contract. Gemma terms apply.                                                                 |
| "granite3.3:8b"  | IBM describes an 8B, 128K, instruction-tuned model with explicit text-classification, extraction, function-calling, and structured-reasoning capabilities. [IBM model card](https://huggingface.co/ibm-granite/granite-3.3-8b-instruct)     | Primary P3; strongest purpose-fit hypothesis for evidence-bearing classification. | Generic capability listing is not a SynAc tagging score. Keep semantic validation outside the model.                                                                                                           |
| "llama3.1:8b"    | Meta describes the 8B text model as an autoregressive optimized Transformer with GQA and 128K context; the instruct version is aimed at multilingual dialogue. [Meta model card](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)   | Primary P4; independent provider/family contrast.                                 | Custom Llama 3.1 Community License; text-only, no native SynAc evaluation.                                                                                                                                     |
| "phi4-mini:3.8b" | Microsoft describes a 3.8B dense decoder-only Transformer with 128K context, GQA, a 200K vocabulary, SFT/DPO post-training, and function-calling improvements. [Microsoft model card](https://huggingface.co/microsoft/Phi-4-mini-instruct) | Held-out arbiter A1 and low-memory challenger.                                    | Smallest candidate; do not interpret speed/cost as evidence of sufficient rare-tag recall.                                                                                                                     |
| "mistral:7b"     | Mistral's v0.3 card lists 7B parameters, 32K context, Apache 2.0 weights, and a function-calling-capable v0.3 instruct release. [Mistral model card](https://docs.mistral.ai/models/model-cards/mistral-7b-0-3)                             | Held-out arbiter A2 / historical diversity challenger.                            | Mistral marks this model retired and recommends a newer model for new integrations. Do not make it the sole or release-blocking primary lane.                                                                  |

All six are distinct named vendor families, which makes a cross-family panel plausible. It does **not** prove statistically independent errors: fine-tunes, training overlap, quantization, prompt format, and shared public sources can correlate failures. Measure error-indicator correlation on frozen, source-verifiable controls before accepting any lane.

## Independent local classifier shortlist

The six generative lanes above create the synthetic reference and therefore
cannot compete as classifiers against it. The local classifier bake-off needs
separate model lineages:

| Candidate                                     | Frozen role                                                      | First-party evidence                                                                                                                                                                                                                                                                                                                                                                     | Constraint                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nomic-ai/modernbert-embed-base`              | Primary frozen-embedding control plus one-vs-rest logistic heads | Nomic's model card describes an Apache-2.0 Sentence Transformer built from ModernBERT-base, 768-dimensional embeddings with a 256-dimensional Matryoshka option, and a 596 MB safetensors file at revision `d556a88e332558790b210f7bdbe87da2fa94a8d8`. [Model card and pinned tree](https://huggingface.co/nomic-ai/modernbert-embed-base/tree/d556a88e332558790b210f7bdbe87da2fa94a8d8) | Requires documented input prefixes. General MTEB results are not SynAc evidence.                                                                      |
| `BAAI/bge-base-en-v1.5`                       | Independent compact embedding control plus the same heads        | BAAI's card lists MIT licensing, 768 dimensions, a 512-token sequence limit, a 438 MB safetensors file, and classification support. [Model card](https://huggingface.co/BAAI/bge-base-en-v1.5)                                                                                                                                                                                           | The shorter context requires a frozen, hash-participating truncation policy.                                                                          |
| `MoritzLaurer/ModernBERT-large-zeroshot-v2.0` | Zero-shot NLI taxonomy diagnostic                                | The model card identifies an Apache-2.0 ModernBERT-large sequence classifier and reports an 8K-capable architecture with lower memory use than the author's DeBERTa comparison. [Model card](https://huggingface.co/MoritzLaurer/ModernBERT-large-zeroshot-v2.0)                                                                                                                         | Same ModernBERT lineage as the primary control; it is a candidate variant, not independent corroborating evidence. Hypothesis wording must be frozen. |

The SetFit challenger should start from the winning eligible Sentence
Transformer only after compatibility is mechanically verified. It remains a
separate trained candidate generation because it modifies encoder weights.

Do not admit EmbeddingGemma, Qwen-derived embeddings, or Granite-derived
embeddings against this synthetic reference generation: their named families
already produce its labels. This exclusion is a leakage/firewall decision, not
a quality judgment. A future reference generation with different label families
may reconsider them.

## Served model facts, prices, and effort matrix

OpenAI's fetched model pages state that both Luna and Terra support the Responses API, Batch, function calling, and Structured Outputs; their context window is 1.05M tokens and their maximum output is 128K. OpenAI positions Luna for cost-sensitive, high-volume workloads and Terra as the intelligence/cost balance. [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) · [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)

**Displayed prices, USD per 1M tokens, accessed 2026-08-09:**

| Model           | Standard input | Cached input | Standard output | Derived Batch input/output\* |
| --------------- | -------------: | -----------: | --------------: | ---------------------------: |
| "gpt-5.6-luna"  |          $0.20 |        $0.02 |           $1.20 |                $0.10 / $0.60 |
| "gpt-5.6-terra" |          $2.00 |        $0.20 |          $12.00 |                $1.00 / $6.00 |

\*The Batch column is the displayed standard rate multiplied by the documented 50% Batch discount, not a separately quoted snapshot price. Model prices are live commercial data: verify the model page immediately before a paid run. The cost formula is:

```text
cost = (uncached_input_tokens × input_rate
      + cached_input_tokens × cached_input_rate
      + billed_output_tokens × output_rate) / 1,000,000
```

Treat reasoning tokens as billed output for budgeting when the API reports them in output usage; Batch exposes an output-token breakdown that includes reasoning tokens. Do not budget from visible JSON alone.

OpenAI's current family guidance says GPT-5.6 supports "low", "medium", "high", "xhigh", and "max" reasoning effort (and also "none"). It recommends "medium" as a balanced starting point, "low" for latency-sensitive work, "high"/"xhigh" only when measured quality improves, and "max" for the hardest quality-first work after comparing it with "xhigh". [Official guidance](https://developers.openai.com/api/docs/guides/latest-model)

| Effort   | Luna experiment                                          | Terra experiment                              | Promotion rule                                                                                     |
| -------- | -------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "low"    | Cost/latency floor; no decisive role.                    | Served lower-bound baseline.                  | Retain only if it clears every reliability gate.                                                   |
| "medium" | Primary high-volume served baseline; still non-decisive. | Initial balanced Terra comparison.            | Promote only if it matches the next higher tested effort on all preregistered reliability metrics. |
| "high"   | Test only after medium's result is known.                | First plausible routine escalation candidate. | Require a measured gain versus medium that justifies output-token cost.                            |
| "xhigh"  | Test only on disagreement/challenge strata.              | Compare against high for hard cells.          | Keep only if it beats high on the same frozen cells.                                               |
| "max"    | Do not make Luna's default.                              | Quality-ceiling challenger only.              | Never assume max wins; compare with xhigh as OpenAI directs.                                       |

The raw Batch run overturned the agent-session ordering. Terra `max` led at
97.7%, Terra `xhigh` followed at 96.8%, and Terra `low` reached 95.9%. This
non-monotonic cross-run change is why model effort must be measured through one
immutable API harness rather than inferred from model positioning or agentic
pilots.

## Batch economics and request shape

Batch is a good fit for this workload because OpenAI documents it for offline classification and evaluation: 50% lower cost, a separate higher-limit pool, and completion within 24 hours. Each input file is JSONL, must use one model, and every request needs a unique "custom_id". [Batch API guide](https://developers.openai.com/api/docs/guides/batch)

OpenAI rejects mixed-model Batch files. Use at least one input file and Batch ID
per exact model. Multiple efforts may share that model-homogeneous file when
each request has a unique custom ID and the manifest freezes effort, schema,
prompt, and benchmark hashes. Split efforts further when independent budget,
cancellation, or scheduling boundaries matter. Batch is unsuitable for
interactive reviewer feedback, but that is not this offline content workflow.

Illustration only—**not a forecast**: for 7,305 one-request-per-Entry
classifications averaging 600 input and 80 _total billed output_ tokens, Batch
would cost about $0.79 with Luna or $7.89 with Terra before cache effects,
retries, or taxes. High/xhigh/max reasoning can materially increase billed
output, so record actual per-request usage and impose a manifest budget cap.
These token counts are inherited planning assumptions, not measured usage.

## Structured output, label shape, and validation

Use the same strict JSON Schema on local and served lanes. OpenAI documents Structured Outputs as enforcing a supplied JSON Schema and making safety refusals programmatically detectable. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) Ollama documents a local "format" field that accepts JSON or a JSON Schema; pass the schema in both the API field and prompt, then validate the response again. [Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs)

The schema is a syntax guard, not a semantic validator. Every request should return exactly one independent decision for each frozen Tag:

```json
{
  "entry_hash": "sha256:...",
  "tag_contract_hash": "sha256:...",
  "run_config_hash": "sha256:...",
  "injection_suspected": false,
  "decisions": [
    {
      "tag_id": "identity-and-access",
      "verdict": "yes",
      "confidence": 0.0,
      "rule_ids": ["identity-and-access/I-2"],
      "evidence": [{ "field": "definition", "start": 0, "end": 0 }]
    }
  ]
}
```

Validation must reject a response that has an unknown Tag/rule, wrong hash, missing decision, duplicate decision, invalid byte offsets, invalid evidence, or a safety refusal that cannot satisfy the contract. Invalid output becomes "abstain"/"unresolved", not a silently repaired negative. This preserves multi-label sparsity: never use a mutually-exclusive class or force every entry to receive a positive Tag.

## Reproducibility policy

OpenAI says snapshots can lock a specific model version so behavior remains consistent, but the fetched Luna and Terra pages displayed their aliases rather than a dated snapshot identifier. Pin a dated snapshot **only if it is actually exposed and accepted by the API at run time**; otherwise record the returned model ID, request ID, system fingerprint if supplied, timestamp, and every request parameter. Do not represent an alias-only run as immutable.

OpenAI's reproducibility guidance also says a fixed seed is best-effort, and outputs can still differ even with matching request parameters and system fingerprint. That cookbook's documented seed support is model-specific and historical, so do not infer GPT-5.6 seed support from it without a direct capability check. Archive raw responses and make only normalization and aggregation deterministic. [OpenAI reproducibility guidance](https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter)

For every run archive:

- frozen input snapshot and "contentVersion", frozen Tag-contract version, source document hashes, prompt renderer, schema, validators, and aggregator;
- local Ollama version, tag/list ID, full FROM blob hash, Modelfile/template, sampler, context length, host/GPU/driver/runtime information, and raw text;
- served endpoint/model/snapshot-or-returned-model ID, effort, all request parameters, batch/input/output/error file IDs, request IDs, usage, and raw JSON; and
- input/order seed, output schema version, validator output, all retries, refusals, abstentions, and deterministic aggregate result.

The reproducible artifact is a content-addressed **synthetic reference generation**, not an assertion that any model call is deterministically replayable or semantically true.

## Event-triggered operating policy

Do **not** schedule routine model refreshes. Create or rerun work only when a material event occurs; rerun the smallest valid slice unless the event changes the contract or a model identity.

| Trigger                                                                                                                                                         | Required action                                                                                                                                                                                | Why it is event-driven                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| First creation of a frozen taxonomy/corpus/contract                                                                                                             | Full qualification plus initial local and served bake-off.                                                                                                                                     | No valid synthetic reference generation exists yet. |
| Tag IDs, inclusion/exclusion/boundary rules, cross-tag constraints, prompt renderer, JSON Schema, validators, or aggregation code changes                       | New full generation; never compare it directly with the old one.                                                                                                                               | The decision function changed.                      |
| New/changed source content, override, or compiled "contentVersion"                                                                                              | Classify only changed Entries plus deterministic affected-neighbor checks. A served uncertainty route runs only if that exact route was separately assessed; it never writes reference labels. | Corpus event, not a date.                           |
| Local tag/list ID, blob hash, Modelfile, Ollama/runtime/GPU config changes                                                                                      | Re-run controls and the relevant candidate benchmark before accepting outputs from the changed lane.                                                                                           | The effective local model may have changed.         |
| Served snapshot/returned-model ID, fingerprint, model capability, or price change                                                                               | Re-run the Terra/Luna control slice and cost comparison; require explicit approval to submit paid work if the budget changes materially.                                                       | Provider/model event, not a calendar interval.      |
| Any schema failure, foreign-hash/seal error, injection flag, mirror instability, unexpected disagreement cluster, or preregistered usage/latency ceiling breach | Quarantine affected cells; run the adversarial and held-out escalation paths.                                                                                                                  | Evidence-quality incident.                          |
| A previously unresolved cell receives materially new source text or Tag-contract guidance                                                                       | Re-open only that cell and its deterministic dependency set.                                                                                                                                   | New evidence changes the decision context.          |

Time passing alone is not a trigger. Do not run weekly/monthly re-labeling, and do not use a scheduled Batch job merely to keep outputs fresh.

## Measured public-anchor pilot

The repository now contains a reproducible 110-case public-anchor fixture and
all ten requested agentic configurations. The first fixture generation was
invalidated and preserved after the models exposed two taxonomy contradictions:

- `command-and-control` is a non-cyber military definition in the compiled
  corpus, so it cannot be a positive Threats and adversary behavior anchor; and
- `capability-vulnerability-management` explicitly identifies CVEs, so it
  cannot be a negative Vulnerabilities and remediation anchor.

Taxonomy/benchmark version 2 replaces those examples with
`fallback-channels` and `vulnerability-assessment-and-management`. The corrected
fixture hash is
`28ae4540e3c7e84564e1e4fd0c337d80105ebb13d6b34c569329c75ccf2c465b`.
The central scorer reports:

| Model | Effort | Balanced accuracy | Worst-Tag balanced accuracy |
| ----- | ------ | ----------------: | --------------------------: |
| Luna  | low    |             80.9% |                       50.0% |
| Luna  | medium |             89.1% |                       60.0% |
| Luna  | high   |            100.0% |                      100.0% |
| Luna  | xhigh  |            100.0% |                      100.0% |
| Luna  | max    |            100.0% |                      100.0% |
| Terra | low    |             99.1% |                       90.0% |
| Terra | medium |             97.3% |                       90.0% |
| Terra | high   |             98.2% |                       90.0% |
| Terra | xhigh  |            100.0% |                      100.0% |
| Terra | max    |             98.2% |                       90.0% |

These numbers are **not promotion evidence**. The anchors and 5/5 balance are
public, v2 followed v1 in the same agent/file lanes, and the Codex agents could
choose scripts or reuse their owned result. The runner exposes neither raw API
usage nor billable reasoning tokens; its timestamps are not raw-model latency.
Zero mirror flips also do not establish independent repeat stability.

That agent-session screen is superseded for served-model selection by the raw
API evidence below. Its artifacts remain useful as a record of why agentic
execution cannot substitute for a uniform model API harness.

## Measured raw OpenAI Batch public-anchor run

The API harness submitted two model-homogeneous Batches, one for Luna and one
for Terra. Each contained all five requested efforts and two requests per
effort: original benchmark order and exact reverse order. All 20 requests
completed without API errors and satisfied the strict JSON Schema. The scorer
then applied stricter semantic checks to rule IDs and evidence keys.

| Model | Effort | Contract          | Balanced accuracy | Worst Tag | Mirror flips | Reasoning tokens | Two-pass Batch cost |
| ----- | ------ | ----------------- | ----------------: | --------: | -----------: | ---------------: | ------------------: |
| Terra | max    | PASS              |             97.7% |     90.0% |         0.9% |           60,242 |           $0.505970 |
| Terra | xhigh  | PASS              |             96.8% |     85.0% |         0.9% |           17,242 |           $0.250106 |
| Luna  | max    | FAIL: 2 rule IDs  |             96.4% |     85.0% |         1.8% |           91,366 |           $0.068863 |
| Terra | low    | PASS              |             95.9% |     80.0% |         0.9% |            1,536 |           $0.159020 |
| Luna  | low    | FAIL: 24 rule IDs |             95.9% |     80.0% |         4.5% |              183 |           $0.014401 |
| Terra | high   | FAIL: 3 rule IDs  |             95.5% |     80.0% |         1.8% |            6,116 |           $0.181568 |
| Terra | medium | FAIL: 48 rule IDs |             95.5% |     80.0% |         0.0% |            3,055 |           $0.165836 |
| Luna  | high   | FAIL: 2 rule IDs  |             94.5% |     80.0% |         1.8% |           12,603 |           $0.021577 |
| Luna  | xhigh  | FAIL: 1 rule ID   |             94.5% |     80.0% |         1.8% |           35,647 |           $0.035802 |
| Luna  | medium | FAIL: 3 rule IDs  |             94.1% |     75.0% |         4.5% |            3,405 |           $0.017101 |

“Contract” is stricter than JSON-schema validity. Every raw response had the
required shape and all 110 decisions; failures above are out-of-range
one-based rule citations. Verdict metrics remain measurable, but a provenance
failure must become REVIEW or ABSTAIN if rule citations are part of the shipped
classifier contract. The minimum production interfaces do not require rule
citations, so a deliberately verdict/score-only candidate generation may test
Luna `max` without silently repairing this generation's invalid evidence.

Aggregate measured usage was 743,960 input tokens, zero cached input tokens,
349,328 output tokens including 231,395 reasoning tokens, and $1.420243 in
Batch charges. The separate one-case synchronous smoke used 2,357 input and 142
output tokens, including 51 reasoning tokens; at the displayed standard Luna
rates it cost approximately $0.000642. The rejected mixed-model Batch executed
zero requests and incurred no inference-token cost.

Batch elapsed time was 373 seconds for Luna and 511 seconds for Terra. Because
each family shared one Batch, that measures family-level asynchronous
turnaround, not per-effort latency. No input tokens were cached, so a future
production prompt renderer should measure whether stable prefixes improve
cache economics rather than assuming they will.

The errors are concentrated in intentionally difficult negatives:

- cryptographic versus malware uses of environmental keying;
- generic facilities versus physical/environmental security;
- exploit behavior versus an underlying vulnerability subject; and
- vulnerability-management workforce wrappers versus substantive remediation.

All candidates produced zero abstentions. Combined with the hard-negative false
positives, that is evidence against direct uncalibrated AUTO application even
for Terra `max`. Per-Tag calibration and selective abstention remain mandatory.

Advance these served configurations to the fresh sealed synthetic-reference
comparison:

1. Terra `max` — measured served accuracy ceiling;
2. Terra `xhigh` — within 0.9 absolute percentage points at roughly half the
   measured cost; and
3. Luna `max` — within 1.4 points at roughly one-seventh the Terra-max cost,
   evaluated under an explicitly frozen verdict-only contract or after a new
   provenance-contract generation.

Terra `low` remains the fully contract-valid served floor, not a finalist: Luna
`max` dominates its verdict quality and cost, while Terra `xhigh` dominates its
quality for a modest absolute pilot cost. Keep it only as a control if the
sealed evaluation budget permits. All other efforts are dominated on this
fixture. This is Pareto pruning for the next experiment, not a production model
choice or certification.

Full agentic and raw-API artifacts are in
[`results.md`](../../experiments/tagging/served-model-bakeoff/results.md) and
[`api-results.md`](../../experiments/tagging/served-model-bakeoff/api-results.md).

## Benchmark contract before any promotion

The next fixed comparison should include the three shortlisted served
configurations plus the eligible independent local classifier candidates, all
against the same frozen inputs, contracts, schema, output limit, and
no-tool/stateless settings.

Report only protocol-conformance and reliability measures:

- schema/hash/evidence-offset validity and refusal/abstention rate;
- per-Tag positive rate, coverage, and sparse-label distribution;
- order-mirrored stability and repeated-call stability;
- exact deterministic/source-verifiable control performance;
- cross-family disagreement, correlation, and adversarial-critic overturns;
- total input, cached input, output/reasoning tokens, latency, local throughput, and actual dollar cost; and
- calibration and acceptance rates as defined by the existing synthetic-panel protocol.

Do not call a majority, a Terra result, or a synthetic-panel aggregate ground truth. Do not compute or publicize "accuracy" without a separate, explicitly defined reference; describe results as agreement, control performance, stability, calibration, and protocol conformance.

## Risks and non-promotions

- **No human adjudication:** this design cannot prove that a Tag is semantically correct. It only creates a reproducible synthetic reference label under a frozen contract.
- **Sparse positives:** a fast all-negative model can look superficially stable. Track every Tag's positive rate and its source-verifiable controls; require direct evidence spans for positives.
- **Shared failures:** different vendors do not guarantee independent training data or errors. Do not relax the correlation gate because a panel is diverse by name.
- **Served cybersecurity prompts:** OpenAI notes its GPT-5.6 safety systems can delay or refuse legitimate defensive cybersecurity work. Treat a refusal as an auditable abstention and do not retry until it says the preferred answer. [GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
- **Reproducibility:** OpenAI calls fixed-seed behavior best-effort; local quantizations/templates can change independently of an upstream card. Raw artifacts, not a model nickname, are the record.
- **Cost and egress:** Batch has a 24-hour window and live prices; its eventual cost is dominated by total billed output/reasoning. Submit only public, approved content to an external provider and obtain approval before a materially costly batch.
- **Mistral retirement:** retain it only as a version-locked diverse challenger while it earns its role; its vendor says not to choose it for new integrations.

## Primary sources

All external claims above are from first-party vendor documentation or vendor-controlled model cards, accessed 2026-08-09.

| ID  | Source                                   | Exact URL                                                                                      |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| O1  | OpenAI GPT-5.6 Terra model page          | <https://developers.openai.com/api/docs/models/gpt-5.6-terra>                                  |
| O2  | OpenAI GPT-5.6 Luna model page           | <https://developers.openai.com/api/docs/models/gpt-5.6-luna>                                   |
| O3  | OpenAI GPT-5.6 model guidance            | <https://developers.openai.com/api/docs/guides/latest-model>                                   |
| O4  | OpenAI Batch API guide                   | <https://developers.openai.com/api/docs/guides/batch>                                          |
| O5  | OpenAI Structured Outputs guide          | <https://developers.openai.com/api/docs/guides/structured-outputs>                             |
| O6  | OpenAI reproducibility cookbook          | <https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter> |
| R1  | Ollama Structured Outputs documentation  | <https://docs.ollama.com/capabilities/structured-outputs>                                      |
| L1  | Qwen Qwen3-8B model card                 | <https://huggingface.co/Qwen/Qwen3-8B>                                                         |
| L2  | Google Gemma 3 12B IT model card         | <https://huggingface.co/google/gemma-3-12b-it>                                                 |
| L3  | Meta Llama 3.1 8B Instruct model card    | <https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct>                                      |
| L4  | IBM Granite 3.3 8B Instruct model card   | <https://huggingface.co/ibm-granite/granite-3.3-8b-instruct>                                   |
| L5  | Microsoft Phi-4-mini-instruct model card | <https://huggingface.co/microsoft/Phi-4-mini-instruct>                                         |
| L6  | Mistral 7B v0.3 model card               | <https://docs.mistral.ai/models/model-cards/mistral-7b-0-3>                                    |
| L7  | Mistral 7B Instruct v0.3 model card      | <https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.3>                                    |
