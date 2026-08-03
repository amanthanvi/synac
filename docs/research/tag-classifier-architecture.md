# Tag classifier architecture for SynAc

Status: research resolution for issue #184
Evidence refreshed: 2026-08-03

## Decision

Admit five architecture families to the tagging bake-off:

1. frozen local text embeddings with one-vs-rest logistic heads;
2. SetFit or an equivalent contrastively fine-tuned small encoder with a multilabel head;
3. zero-shot natural-language-inference (NLI) classification;
4. direct small-LLM multilabel classification, both local and hosted;
5. selective cascades whose first stage handles easy cases and whose second stage sees only uncertain cases.

The leading system hypothesis is an offline, versioned selective cascade:

```text
entry text
  -> pinned local embedding model
  -> independent calibrated score per tag
  -> AUTO when that tag's certified threshold is met
  -> local small LLM only for the unresolved band
  -> REVIEW or ABSTAIN unless that cascade route is separately certified
```

The control must be the simpler frozen-embedding system, not the cascade. SetFit is the strongest local challenger because it can adapt the representation using the adjudicated development set. A direct small LLM remains a credible total-cost winner: SynAc has only 7,305 current entries, so hosted batch inference costs dollars or less for economical models, and a direct classifier may remove enough training and packaging complexity to dominate overall operating cost. Hosted models are quality-ceiling benchmarks, not the default deployment choice.

No architecture receives an automatic lane because of aggregate accuracy. Each `(candidate, tag, route)` must independently satisfy SynAc's one-sided 95% precision lower-bound gate of at least 98%. A route that cannot support that evidence remains REVIEW-only or abstains.

## SynAc constraints

These are repository and product facts, not claims made by the model sources:

- The checked-in corpus currently contains 7,305 entries from five generated bundles and eight non-exclusive topical tags.
- Classification is offline. Production serving must not depend on a model endpoint or local inference runtime.
- Entries may receive zero, one, or several tags.
- Precision is the hard constraint; coverage is optimized only among candidates that pass it.
- Human overrides are authoritative, and accepted assignments move through ordinary content PRs.
- The development loop cannot inspect calibration, blind, challenge, or predicted-positive audit labels.
- The local-first selection rule prefers a passing local candidate when its certified full-corpus coverage is within one absolute percentage point of the best passing candidate.

These constraints make selective classification a better fit than compulsory classification: the system can trade coverage for a bounded error rate and preserve useful REVIEW and ABSTAIN outcomes.

## What the primary sources establish

### Frozen embeddings plus one-vs-rest heads

[EmbeddingGemma's model card](https://huggingface.co/google/embeddinggemma-300m/blob/main/README.md) describes a 300M-parameter local embedding model intended for classification as well as retrieval and similarity. It accepts up to 2,048 tokens and emits a 768-dimensional vector that can be truncated to 512, 256, or 128 dimensions. Its documented classification instruction is `task: classification | query: ...`. The card also says its activations do not support `float16`, so a bake-off must use `float32`, `bfloat16`, or a supported quantized artifact rather than assuming generic half-precision support. Access is gated by Google's Gemma terms, which must be reviewed before it becomes an approved weight.

[Sentence Transformers' inference-efficiency guide](https://sbert.net/docs/sentence_transformer/usage/efficiency.html) supports PyTorch, ONNX, and OpenVINO backends and documents CPU-oriented dynamic int8 quantization for ONNX. This makes a pinned encoder plus small scikit-learn heads viable on commodity CI or developer hardware, but the documentation's example benchmarks are not SynAc throughput guarantees.

**SynAc inference:** one embedding pass can feed all tag heads, so inference cost is approximately `O(entries)` plus a very small `O(entries × tags)` linear-head cost. Independent one-vs-rest heads naturally support zero, one, or many tags and produce a separate score distribution for each tag. This should be the unchanged control because it is the easiest candidate to reproduce, calibrate, inspect, and package. Its main risk is representation mismatch: a frozen general-purpose embedding may not separate narrow cybersecurity concepts or hard lexical negatives.

### SetFit or another fine-tuned small encoder

The [SetFit paper](https://arxiv.org/abs/2209.11055) defines a two-stage method: contrastively fine-tune a Sentence Transformer on labeled text pairs, then train a classification head on the resulting embeddings. In the authors' evaluated tasks it used fewer parameters and trained substantially faster than the prompt-based few-shot methods they compared. Those benchmark results are evidence that the family is worth testing, not evidence that it will pass SynAc's per-tag precision gate.

The official [SetFit multilabel guide](https://huggingface.co/docs/setfit/how_to/multilabel) supports one-vs-rest, multi-output, and classifier-chain heads, including logistic-regression and differentiable heads.

**SynAc inference:** start with one-vs-rest so each tag keeps an independent score and threshold. Compare a shared fine-tuned body against the frozen-embedding control. A classifier chain may exploit co-occurrences, but it also makes label order part of the model and can propagate errors; admit it only as a secondary experiment after the independent-head baseline. SetFit increases training cost, stochasticity, weight provenance, and leakage risk, but it may materially improve rare or domain-specific tag separation with the planned adjudicated labels.

### Zero-shot NLI

The [BART-large-MNLI model card](https://huggingface.co/facebook/bart-large-mnli) describes the standard NLI transformation: treat the entry as a premise, turn each candidate label into a hypothesis, and derive a label score from entailment versus contradiction. Its `multi_label=True` mode evaluates labels independently. The published checkpoint is about 0.4B parameters in F32.

The label text is part of the model. Gao et al.'s [EMNLP study of label-description training](https://aclanthology.org/2023.emnlp-main.853/) found material gains and improved robustness over plain zero-shot methods on the paper's topic and sentiment evaluations when models were trained on richer label descriptions. This supports using SynAc's eventual inclusion rules, exclusions, examples, and hard negatives as controlled candidate inputs rather than bare tag names.

**SynAc inference:** NLI is valuable as a no-task-training baseline and a taxonomy-contract diagnostic. It is less attractive as the expected winner because it performs an encoder pass for every entry/tag pair, its score depends on hypothesis wording, and MNLI entailment scores are not certified probabilities of topical correctness. Keep prompt/hypothesis templates fixed within an experiment and calibrate every tag separately. If it is materially dominated on coverage, resource use, and stability, discard it after the baseline.

### Direct small-LLM classification

Google's [Gemma 3 model card](https://ai.google.dev/gemma/docs/core/model_card_3) provides open-weight instruction-tuned models at 1B and 4B parameters (among larger sizes); Google's [deployment guidance](https://ai.google.dev/gemma/docs/get_started) targets the 1B model at mobile/single-board devices and the 4B model at desktops and small servers. This establishes plausible local candidates, not their SynAc accuracy or latency.

Hosted APIs offer structured-output-capable, classification-oriented models and asynchronous batch paths. For example, the [GPT-5 nano model page](https://developers.openai.com/api/docs/models/gpt-5-nano) explicitly lists classification as a target workload and exposes a dated snapshot; the [OpenAI Batch API](https://platform.openai.com/docs/api-reference/batch/object?api-mode=responses), [Gemini Batch API](https://ai.google.dev/gemini-api/docs/batch-api), and [Claude Message Batches](https://platform.claude.com/docs/en/build-with-claude/batch-processing) all document asynchronous bulk processing at a 50% token-price discount.

**SynAc inference:** test a single prompt that supplies the frozen tag contracts and asks for strict schema-conforming per-tag scores or decisions. Do not treat natural-language confidence as calibrated probability. Parse failure, missing labels, duplicate labels, and non-finite scores are failed runs, not abstentions. For local generation, pin the exact weight revision, quantization, runtime, prompt, sampling settings, and chat template. For hosted generation, pin a provider snapshot where available and record response metadata, actual tokens, requests, and dollars. A model alias without immutable versioning is unsuitable for automatic production assignments even if it is useful as a ceiling benchmark.

Direct generation may be operationally simpler than maintaining supervised heads, but local CPU inference can make autonomous experiments unproductively slow. Measure it before admitting large local weights to the full autoresearch budget.

### Selective cascades

[Selective-classification research](https://proceedings.neurips.cc/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html) formalizes the reject option: trade coverage for a chosen risk level. This directly matches SynAc's AUTO, REVIEW, and ABSTAIN lanes. The paper does not establish that a score threshold alone will meet SynAc's 98% precision lower bound; that remains an empirical certification requirement.

**SynAc inference:** cascade only when the second stage adds certified coverage or useful review suggestions at acceptable incremental cost. Route on frozen, preregistered criteria such as an interval between per-tag thresholds; do not let a generative model decide whether its own output deserves escalation or automation. Report metrics separately for the first-stage route, second-stage route, and union. Otherwise strong first-stage predictions can hide a weak fallback.

## Calibration, abstention, and certification

[Guo et al.](https://proceedings.mlr.press/v70/guo17a.html) show that modern neural-network confidence can be poorly calibrated and that post-hoc temperature scaling was effective across their evaluated datasets. The [scikit-learn calibration guide](https://scikit-learn.org/stable/modules/calibration.html) makes the key leakage boundary explicit: a calibrator should be fit on data independent of the classifier's training data. It supports sigmoid and isotonic mappings, warns that isotonic calibration is prone to overfit on small datasets, and recommends roughly 1,000 or more calibration samples before preferring it on data-volume grounds.

Therefore:

- During autoresearch, derive only provisional per-tag thresholds from grouped out-of-fold development predictions.
- After finalist code and weights are frozen, fit one sigmoid calibrator per tag on the untouched 300-entry calibration split. Treat isotonic calibration as ineligible unless a later generation preregisters materially more independent calibration data.
- Choose a high AUTO threshold and a lower REVIEW threshold per tag. Scores below REVIEW abstain. Do not force probabilities to sum to one because tags are non-exclusive.
- Calibrate each cascade route separately if its score generation differs.
- Use calibration curves, log loss/Brier decomposition, and rank metrics diagnostically; none replaces the release precision bound.

Certification uses a never-tuned random audit of predicted positives for each automatic tag lane. Use an exact one-sided binomial lower interval, such as the Clopper-Pearson method implemented by SciPy's [`binomtest(...).proportion_ci(method="exact")`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binomtest.html). With zero observed errors, the one-sided 95% lower bound is `0.05^(1/n)`; 149 correct audited positives are required to reach 0.98. Any error increases the required sample. Fix the sampling and stopping rule before labels are revealed.

Conformal multilabel methods are a worthwhile research reference—the JMLR paper [Knowing what You Know](https://jmlr.org/papers/v22/20-753.html) studies confidence sets for multilabel prediction—but set coverage is not positive predictive value. Conformal coverage cannot substitute for SynAc's per-tag precision audit.

## Reproducibility, provenance, and drift

Local does not automatically mean deterministic. The [PyTorch reproducibility notes](https://docs.pytorch.org/docs/stable/notes/randomness) state that complete reproducibility is not guaranteed across releases, platforms, or CPU/GPU execution; deterministic algorithms and fixed random seeds constrain variation, sometimes at a performance cost. OpenAI's [seed example](https://developers.openai.com/cookbook/examples/reproducible_outputs_with_the_seed_parameter) likewise treats seeded hosted generation as mostly reproducible rather than guaranteed identical.

Every candidate run must therefore record and hash:

- corpus rows and entry content hashes;
- taxonomy contracts and their ordering;
- split and concept-family manifests;
- source code, prompt, chat template, features, calibrator, thresholds, and configuration;
- model repository, immutable revision, individual weight files, tokenizer, and quantization;
- Python/package lock, inference backend, driver/runtime versions, seed, deterministic flags, and hardware;
- raw scores, lane decisions, cascade route, parse failures, logs, and prediction artifacts;
- cold/warm latency, CPU/GPU time, peak memory, model bytes, network bytes, hosted tokens, requests, and actual spend.

Run every finalist three times. Deterministic candidates should have identical score and assignment hashes. Otherwise report per-tag score variance and decision-flip rates. A change to the corpus text, taxonomy, prompt, feature extraction, model revision, runtime, calibrator, or thresholds invalidates the corresponding provenance hash and requires reclassification; a model-provider alias changing behind the same name is drift, not a harmless implementation detail.

Monitor source-specific prevalence and error because the corpus mixes MITRE ATT&CK techniques with RFC, NIST, NICCS, and OWASP glossary material. A candidate can look strong in aggregate while failing on one source's writing style or label distribution.

## Cost and resource envelope

### Hosted quality-ceiling examples

The table below is an illustration, not a budget promise. It assumes 7,305 requests, 600 billed input tokens and 80 billed output tokens per entry: 4.383M input tokens and 0.5844M output tokens. It uses batch prices visible in the linked provider documentation on 2026-08-03 and excludes retries, failed requests, cache effects, taxes, and any hidden/reasoning tokens billed as output.

| Candidate | Batch input/output per MTok | Illustrative full-corpus cost |
| --- | ---: | ---: |
| [GPT-5 nano snapshot](https://developers.openai.com/api/docs/models/gpt-5-nano) | $0.025 / $0.20 after the documented 50% batch discount | $0.23 |
| [Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite) | [$0.05 / $0.20](https://ai.google.dev/gemini-api/docs/pricing) | $0.34 |
| [Claude Haiku 4.5](https://platform.claude.com/docs/en/about-claude/models/overview) | [$0.50 / $2.50](https://platform.claude.com/docs/en/build-with-claude/batch-processing) | $3.65 |
| [GPT-5.6 Sol frontier ceiling](https://developers.openai.com/api/docs/models) | $2.50 / $15.00 after the documented 50% batch discount | $19.72 |

The prompt and actual entries must be tokenized with each provider before budget approval. The repository's serialized entry objects contain about 6.8M characters, but that is not a provider token count and the production candidate may omit citation/relationship fields or truncate long entries by a frozen policy. Current provider prices, model availability, retention terms, licenses, and batch semantics must be refreshed when the campaign is preregistered.

The small hosted totals mean token price should not decide the architecture in advance. Human annotation and certification are likely to dominate cash cost. Still, a hosted dependency introduces network use, credentials, provider retention/policy review, model lifecycle risk, and less reproducible inference; those recurring operational costs belong on the Pareto ledger.

### Local measurements

Do not estimate throughput from parameter count alone. The harness must record, on the declared runner:

- dependency/model download and verification time;
- on-disk and resident model bytes;
- cold start and first prediction;
- warm batched throughput over all 7,305 entries;
- training time for each fold and full development fit;
- peak system and accelerator memory;
- CPU/GPU seconds and energy proxy if available;
- output stability across three runs.

Baseline every admitted family before spending more than half the aggregate campaign budget on one family. Use ONNX/OpenVINO or quantized variants only as distinct pinned candidates; do not silently change backends inside a run. A local generative candidate that cannot complete the development fold within the preregistered timeout can remain a manual benchmark without consuming the full autoresearch campaign.

## Bake-off specification

Run these unchanged baselines before autonomous optimization:

| ID | Candidate | Required controlled variants | Purpose |
| --- | --- | --- | --- |
| `E0` | EmbeddingGemma-300M + one-vs-rest logistic heads | pinned F32/BF16-compatible backend; optional separately hashed int8 backend | simple local control |
| `S0` | SetFit + one-vs-rest head | same approved small encoder body where possible | learned local representation |
| `N0` | BART-large-MNLI | bare names vs frozen contract descriptions; fixed hypothesis template | zero-task-training and taxonomy diagnostic |
| `L0` | direct local small LLM | approved pinned 1B and 4B instruction weights; deterministic decoding; strict schema | generative local alternative |
| `C0` | `E0` plus best eligible local LLM on the uncertainty band | fixed route rule and separate route metrics | selective-cascade hypothesis |
| `H0` | economical hosted batch classifiers | pinned/versioned GPT, Gemini, and Claude candidates where supported | low-cost hosted ceiling and provider sensitivity |
| `H1` | one current frontier hosted model | fixed prompt/schema and spend cap | quality ceiling |

One approved hosted embedding plus the same logistic heads may enter as a diagnostic ceiling, but it should not displace the frozen local embedding baseline unless it improves certified coverage enough to justify network and lifecycle costs.

All candidates receive the same normalized entry view, tag contracts, grouped folds, output schema, and evaluator. The mutable candidate must not see calibration, blind, challenge, or audit labels. Record per tag:

- true/false positives and negatives on grouped out-of-fold development predictions;
- provisional exact lower precision bound for AUTO;
- AUTO, REVIEW, and ABSTAIN counts;
- entry-level automatic coverage and assignment-level recall;
- review suggestion precision/recall;
- source-specific error and prevalence;
- three-run flip rate and score variance;
- cold/warm runtime, compute, memory, model bytes, network use, and actual hosted spend.

Rank only provisionally eligible candidates, lexicographically: automatic entry coverage, automatic assignment recall, useful review suggestions, recurring cost/compute, latency/resources, stability, then simplicity. Preserve the non-dominated Pareto set. Do not turn those dimensions into an arbitrary weighted score.

After development-only selection, freeze a small shortlist and perform one-time calibration and certification. Select a passing local candidate when its certified automatic coverage is within one absolute percentage point of the best passing candidate. If no local candidate is within that band, return the hosted/local trade-off for explicit human decision rather than relaxing precision.

## Risks and unresolved implementation choices

- Eight tag contracts do not yet contain the hard negatives and boundary rules needed for a fair semantic-model comparison. Freeze taxonomy inputs before the bake-off.
- Rare tags may not yield enough calibration or predicted-positive audit evidence. They must remain REVIEW-only rather than borrowing aggregate evidence.
- A shared SetFit body can improve representation but also couple tag errors; report per-tag effects and retain independent thresholds.
- Direct LLM outputs may be stable at the lane level while raw explanations vary. The automatic path should request only the minimal strict schema and compare decision hashes as well as text.
- Hosted list prices are tiny at current corpus size but mutable. Actual usage, version support, privacy/retention, and deprecation policy must be captured at campaign freeze.
- Local generative throughput on CPU may make autoresearch infeasible. Run a timed smoke baseline before allocating it a large experiment budget.
- Automatic precision certification is route-specific. A cascade union is not certified merely because its first stage passes.

## Resolution

SynAc should build its bake-off around a frozen-local-encoder control, a SetFit challenger, zero-shot NLI diagnostic, direct local and hosted LLM alternatives, and an explicitly routed selective cascade. The expected production shape is local embeddings plus calibrated per-tag heads, optionally escalating uncertain cases to a small local LLM. The actual winner remains evidence-driven: certify precision per tag and route, compare passing coverage, then apply the locked local-first-within-one-point rule.
