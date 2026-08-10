# AI-only adjudication for a 1,500-entry, 11-tag reference set

## Recommendation

Use a sealed, cross-family panel to create a reproducible **synthetic
adjudicated reference set**. Do not call the result a human gold set, ground
truth, or expert annotation.

The minimum defensible design is:

- four independent primary judges from disjoint model families;
- two order-mirrored, stateless passes per judge;
- two blind, forced-position critics for every entry;
- two held-out arbiters for every conflict and a stratified audit;
- calibrated `yes | no | abstain` outputs under a strict JSON Schema; and
- deterministic aggregation over archived raw responses.

This can replace the _workflow_ of human double annotation and adjudication.
It cannot replace the epistemic evidence that humans supplied the labels.
Agreement among models is reliability evidence, not proof of semantic truth.

Repository precondition: the current [`content/tags.json`](../../content/tags.json)
contains eight tags. The proposed run must not start until its manifest freezes
exactly 11 tag IDs and complete inclusion, exclusion, and boundary rules. Do not
silently map an 11-tag study onto the current eight-tag production taxonomy.

## What the evidence says

| Risk                         | Primary-source finding                                                                                                                                                                                                                                                       | Protocol response                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correlated errors            | A study of more than 350 LLMs found substantial error correlation; on one leaderboard, models agreed 60% of the time when both were wrong, with shared architecture and provider among the drivers ([Kim et al., 2025](https://proceedings.mlr.press/v267/kim25e.html)).     | One vote per base-model lineage, measure error correlation on controls, and never interpret a majority as independent Bernoulli evidence.                      |
| Single-judge and family bias | A panel drawn from disjoint model families outperformed a single large judge in the studied settings and reduced intra-model bias ([Verga et al., 2024](https://arxiv.org/abs/2404.18796)).                                                                                  | Four cross-family primaries; no provider/model aliases counted as extra voters.                                                                                |
| Position and order bias      | Changing response order can reverse LLM evaluation outcomes; balanced-position aggregation mitigated the effect ([Wang et al., 2023](https://arxiv.org/abs/2305.17926)).                                                                                                     | Mirror every primary pass with the 11 tags in inverse order. Applying this pairwise-evaluation result to a multi-label list is a precautionary inference.      |
| Self-preference              | Evaluators can recognize and favor their own generations relative to human judgments ([Panickssery et al., 2024](https://arxiv.org/abs/2404.13076)).                                                                                                                         | Hide model identity and never let a model family judge text or arguments produced by that family.                                                              |
| Prompt sensitivity           | The diverse-panel study also found high variance from small prompt changes in some judge settings ([Verga et al., 2024](https://arxiv.org/abs/2404.18796)).                                                                                                                  | Freeze and hash prompts; test a held-out prompt renderer during audit.                                                                                         |
| Prompt injection             | Short adversarial phrases appended to assessed text transferred to unseen judges and could force maximum scores ([Raina et al., 2024](https://arxiv.org/html/2402.14016v2)).                                                                                                 | Treat entry text as untrusted data, run injection controls, expose no tools, and arbitrate every injection flag.                                               |
| Confidence                   | Model self-evaluation can be calibrated in suitable formats, but calibration degrades on new tasks ([Kadavath et al., 2022](https://arxiv.org/abs/2207.05221)).                                                                                                              | Calibrate reported probabilities on SynAc-specific controls and abstain in the middle band. Never use raw verbal confidence.                                   |
| Adversarial discussion       | Multi-agent debate improved results on the paper's reasoning and factuality tasks, but sometimes still converged to the wrong answer ([Du et al., 2023](https://arxiv.org/abs/2305.14325)).                                                                                  | Preserve blind primary votes first; use opposed critics only afterward to expose counterevidence, not to manufacture consensus.                                |
| Format versus meaning        | Strict structured output can constrain syntax ([OpenAI](https://openai.com/index/introducing-structured-outputs-in-the-api/)), but schema-valid values can still be semantically wrong ([Google](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)). | Require strict schema plus semantic validators, evidence offsets, aggregation gates, and audit.                                                                |
| Reproducibility              | Even fixed seeds and identical backend fingerprints provide only mostly identical model outputs; determinism is not guaranteed ([OpenAI Cookbook](https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter)).                            | Archive raw responses. Make normalization and aggregation deterministic; do not claim the model calls themselves are deterministic.                            |
| Test leakage                 | Public benchmarks can enter training data and memorization can masquerade as capability ([Oren et al., 2023](https://arxiv.org/abs/2310.17623)).                                                                                                                             | Keep target labels and peer outputs sealed during the run, record provider data controls, and treat later reuse after publication as potentially contaminated. |

## Concrete protocol

### 0. Freeze the contract

Create an immutable run manifest before any target call. It must contain:

- exactly 1,500 unique entry IDs and 11 stable tag IDs;
- each tag's inclusion, exclusion, boundary examples, and precedence rules;
- SHA-256 hashes of the input snapshot, rubric, prompt renderers, JSON Schema,
  aggregation code, and audit-sampling code;
- a public family-lineage declaration for every lane: training organization,
  base-model family, fine-tune/distillation ancestry if known, provider,
  immutable model ID or weights hash, and API/backend fingerprint;
- decoding parameters (`temperature = 0`, fixed seed where supported, fixed
  token limit, no tools, one candidate); and
- one master sampling seed derived before labels exist, for example
  `SHA256(input_hash || rubric_hash || "synac-ai-adjudication-v1")`.

A provider endpoint is not a model family. Fine-tunes, distilled variants,
aliases, quantizations, and snapshots sharing base weights count as one family.
Unknown closed-model ancestry is a disclosed dependence, not evidence of
independence.

Panel gate: four primary families (`P1`-`P4`) plus two held-out arbiter
families (`A1`, `A2`), all six disjoint, spanning at least four training
organizations. Include at least one open-weight lane with an exact weights
hash. The two critic lanes may reuse two primary families, but must be distinct
from one another and from both arbiter families.

### 1. Qualify the lanes without human labels

Build a source-backed control suite separate from the 1,500 targets:

- 660 unambiguous controls: 30 positive and 30 negative examples for each of
  11 tags;
- 44 adversarial controls: four per tag containing instruction-like text,
  label solicitation, fabricated peer verdicts, or universal scoring phrases;
- labels established by deterministic construction or explicit source/rubric
  entailment, not by another judge model; and
- a fixed 50/50 calibration/validation split, stratified by tag and polarity.

If 60 unambiguous, mechanically or source-verifiable controls cannot be built
for a tag, the no-human protocol cannot validate that tag and must stop.

Fit a monotone calibrator for each direct-decision lane from its reported
`p_applicable` on the calibration half. A lane is eligible only if the held-out
half meets every gate:

- macro-F1 at least `0.90`;
- balanced accuracy at least `0.85` for every tag, with abstentions scored as
  errors for this gate;
- expected calibration error at most `0.08` and Brier score at most `0.15`;
- mirrored-order agreement at least `97%` overall and `95%` per tag;
- zero successful instruction/adversarial-control attacks; and
- pairwise error-indicator correlation across the four primaries: mean phi at
  most `0.30` and no pair above `0.50`.

Replace a failing lane, update the manifest, and restart qualification. Do not
silently down-weight a correlated or weak judge after seeing target outcomes.

### 2. Run blind primary passes

For each entry and primary family, send two fresh, stateless requests:

1. pass `M1`, with tag order set by a seeded permutation; and
2. pass `M2`, with the exact inverse order.

The position of each tag therefore sums to 12 across the pair. Both calls get
only the frozen rubric and raw entry. They receive no conversation history,
retrieval, tools, target labels, peer verdicts, peer rationales, model names,
or content-generator identity. Complete and seal all primary outputs before
opening any to downstream roles.

Each request has a unique `seal_id` that the schema requires the response to
echo. A foreign seal in any response is a leakage incident: invalidate the
affected batch, rotate seals, inspect storage/context reuse, and rerun only
after the cause is fixed. This catches cross-call context leakage; it cannot
detect pretraining contamination.

### 3. Enforce structured, evidence-bound output

Every response must validate against a strict schema equivalent to:

```json
{
  "entry_hash": "sha256:...",
  "rubric_hash": "sha256:...",
  "seal_id": "opaque-one-use-id",
  "injection_suspected": false,
  "decisions": [
    {
      "tag_id": "T01",
      "verdict": "yes",
      "p_applicable": 87,
      "rule_ids": ["T01-I2"],
      "evidence": [{ "field": "definition", "start": 14, "end": 52 }],
      "counterevidence": "Concise, at most 60 words"
    }
  ]
}
```

Deterministic validators require exactly one decision for each of the 11 tags,
known rule IDs, integer probability `0..100`, exact entry/rubric hashes, valid
UTF-8 offsets, and evidence spans that reproduce the input bytes. A positive
verdict needs at least one valid span. An invalid, refused, truncated, or
schema-nonconforming response becomes an abstention; it is not repeatedly
sampled until a preferred answer appears. One identical transport retry is
allowed, and both attempts remain in the audit log.

Collapse a family's mirror pair to one vote:

- `yes` only if both passes say yes and both calibrated probabilities are at
  least `0.80`;
- `no` only if both say no and both calibrated probabilities are at most
  `0.20`; and
- `abstain` for every disagreement, middle-band probability, invalid evidence,
  refusal, or injection flag.

Repeated calls from one family are stability checks, never extra votes.

### 4. Generate adversarial counterarguments

In parallel with aggregation, run two stateless critics on every entry. Neither
critic sees primary outputs or the eventual provisional label:

- `C+` must make the strongest rubric-grounded case for including each tag;
- `C-` must make the strongest rubric-grounded case for excluding each tag.

Both use the same evidence-offset and rule-ID constraints. They return a
`decisive` boolean only when a cited rule and input span would overturn the
opposite position. This forced opposition preserves a live counterargument;
ordinary free-form debate tends toward consensus and can converge incorrectly.
Critic prose is evidence to inspect, not a vote.

### 5. Aggregate and arbitrate conflicts

The deterministic provisional rule for each of the 16,500 entry-tag cells is:

- provisional `yes` or `no` with at least three matching, non-abstaining family
  votes out of four; otherwise
- conflict.

Send a cell to arbitration when any condition holds:

- fewer than three matching primary votes;
- either critic supplies validator-clean `decisive` counterevidence against the
  provisional result;
- any primary or critic flags prompt injection;
- a formal cross-tag constraint fails; or
- the cell was selected for audit.

`A1` and `A2` are held-out families and run independently. They receive the raw
entry, rubric, anonymous primary verdicts with validated evidence, and the two
anonymous critic records. They do not receive family names, raw confidence,
vote order, or the provisional aggregate. `A1` sees the include argument first;
`A2` sees the exclude argument first. Each also gets its own reverse-order
sealed double-check.

An arbitrated `yes` or `no` requires both arbiters to agree across both of their
passes and to clear the same calibrated `0.80/0.20` thresholds. Any arbiter
disagreement, abstention, injection flag, or invalid evidence produces
`unresolved`. Never break a tie with the stronger, larger, or same-provider
model after seeing the result.

### 6. Audit before release

Derive the audit sample from the frozen master seed, before opening audit
results:

- a simple random sample of 150 entries (`10%` of the set);
- deterministic top-ups until every tag has at least 30 accepted positives and
  30 accepted negatives in the audit; and
- 100% of injection-flagged cells, arbitrated cells, schema failures, and cells
  affected by provider/model fingerprint changes.

For non-arbitrated sampled cells, `A1` and `A2` rerun blind using an independently
authored but semantically equivalent prompt renderer, with opposed argument
order. This tests prompt brittleness without revealing the original verdict.

Release only when all gates pass:

- schema, input-hash, rubric-hash, seal, and evidence-offset validity: `100%`;
- accepted-cell coverage: at least `90%` of 16,500 overall and `85%` for every
  tag; unresolved cells remain explicit and are never imputed;
- primary mirror instability: at most `3%` overall and `5%` for every tag;
- both audit arbiters agree with the released label on at least `95%` of
  audited cells overall and `90%` within every tag/polarity stratum;
- lower bound of a seeded 10,000-resample, entry-clustered 95% bootstrap
  interval for overall audit concordance: at least `0.90`;
- adversarial-control success, foreign-seal leakage, and unaccounted model
  version changes: `0`; and
- all six family lineages, requests, retries, refusals, abstentions,
  calibrators, and audit selections have complete provenance.

If the audit fails, quarantine the affected tag or stratum and issue a new run
version after diagnosis. Do not tune prompts on the failed audit sample and
then report that same sample as held out.

## Required release artifacts

Archive enough material to reproduce the deterministic result from raw model
responses:

- run manifest and all hashes;
- frozen inputs, rubric, two prompt renderers, schema, and aggregation code;
- model lineage declarations, immutable IDs/weight hashes, API parameters,
  request IDs, timestamps, and backend fingerprints;
- raw primary, critic, and arbiter responses plus normalized records;
- control-suite construction, split, calibration mappings, and qualification
  report;
- audit seed, sampled IDs, top-up rules, results, and bootstrap code; and
- a dataset datasheet covering motivation, composition, collection process,
  intended uses, exclusions, limitations, and maintenance. This follows the
  documentation rationale in [Datasheets for Datasets](https://arxiv.org/abs/1803.09010).

Suggested row-level provenance:

```json
{
  "label_origin": "synthetic_ai_panel",
  "protocol_version": "synac-ai-adjudication-v1",
  "status": "accepted",
  "primary_vote_pattern": "3-1",
  "arbitrated": false,
  "audit_selected": true,
  "run_manifest_hash": "sha256:..."
}
```

## Why this is synthetic, not human gold

The label origin is generative models. The critiques and arbitration are also
model-generated. A model-written evaluation can be useful—the authors of
[Discovering Language Model Behaviors with Model-Written Evaluations](https://arxiv.org/abs/2212.09251)
demonstrated that explicitly—but usefulness does not change authorship.

Calling this “human gold” would make three false implications:

1. humans independently applied the rubric;
2. human disagreements were adjudicated; and
3. agreement measures reflect human judgment or domain expertise.

None is true. Cross-family consensus also cannot cure shared training data,
shared benchmark exposure, correlated misconceptions, or rubric omissions.
NIST's Generative AI Profile recommends documenting model details, evaluation
data, provenance, and independent assessment, and explains that provenance
metadata helps distinguish synthetic from authentic origins
([NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf)).

Publish as **SynAc Synthetic Adjudicated Reference Set v1** (or “AI-panel
silver set”), with `label_origin = synthetic_ai_panel`. Reserve **human gold**
for a later release in which qualified humans annotate blind, report agreement,
and adjudicate conflicts. Until then, the honest claim is narrower: a
reproducible, bias-tested, multi-model consensus reference with explicit
abstention and known validity limits.

## Practical scale

Batch all 11 tag decisions for one entry into each primary or critic call. The
target run then requires 12,000 primary calls (`1,500 x 4 families x 2
mirrors`) and 3,000 critic calls (`1,500 x 2 opposed critics`). Arbiters judge
cells, with two arbiters and two opposed-order passes per cell: a 150-entry
all-cell audit therefore adds 6,600 calls (`150 x 11 x 2 x 2`), while an
all-cell full-corpus upper bound is 66,000 (`1,500 x 11 x 2 x 2`).

Base primary-plus-critic cost is 15,000 calls. Total cost is that base plus the
preregistered audited/triggered-cell arbitration set, control qualification,
and at most one identical transport retry per failed call.
This is expensive but auditable; reducing the number of independent families,
unsealing primary outputs early, or converting abstentions into majority votes
would remove the core safeguards rather than merely optimize cost.
