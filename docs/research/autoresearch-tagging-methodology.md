# Leakage-safe autoresearch for SynAc tagging

Status: decision record for wayfinder issue #186

Upstream snapshot reviewed: `karpathy/autoresearch@228791fb499afffb54b46200aca536f79142f117`

Scope: development bake-off methodology, not classifier implementation or production release

## Decision

Use Karpathy's autoresearch pattern only as SynAc's autonomous **development** loop. Preserve its small mutable surface, fixed evaluator, fixed experiment budget, baseline-first hypothesis loop, git history, and keep/discard discipline. Replace its single-metric greedy selection and informal untracked ledger with:

- immutable, hash-verified data and evaluation machinery;
- grouped out-of-fold development evaluation;
- a precision-constrained, multi-objective Pareto policy;
- append-only, content-addressed experiment records;
- explicit compute and hosted-spend ceilings;
- separate evaluator contexts for calibration, population test, challenge, and predicted-positive audits; and
- human-controlled unsealing and release checkpoints.

Autonomous optimization ends before calibration. Calibration, blind evaluation, challenge evaluation, and certification audits may certify or reject a frozen generation, but their labels, examples, error slices, and per-row predictions may not feed candidate selection or threshold tuning. A failed generation returns to development and requires fresh certification evidence; it must not learn from the failed sealed evidence.

This adaptation optimizes useful automatic coverage while preserving SynAc's non-negotiable rule: every tag admitted to the `AUTO` lane must independently achieve a one-sided 95% precision lower bound of at least 98%. Coverage never compensates for a precision failure.

## What comes from upstream, and what SynAc changes

The upstream sources are deliberately compact:

- The [README](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/README.md) describes a human-authored `program.md`, fixed `prepare.py`, agent-edited `train.py`, a single GPU, a fixed five-minute training budget, and validation bits-per-byte as the comparison metric.
- The [agent program](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/program.md) requires a fresh branch, an unchanged baseline first, one committed experimental change at a time, and `keep`, `discard`, or `crash` results in `results.tsv`. It explicitly forbids changing `prepare.py`, the evaluator, or dependencies.
- [`prepare.py`](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/prepare.py) owns data preparation, data loading, fixed constants, and the ground-truth evaluator; [`train.py`](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/train.py) is the mutable candidate surface.
- The dependency surface is declared by [`pyproject.toml`](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/pyproject.toml) and resolved by [`uv.lock`](https://github.com/karpathy/autoresearch/blob/228791fb499afffb54b46200aca536f79142f117/uv.lock). Upstream forbids adding packages during a campaign.

Those properties make experiments bounded and reviewable, but upstream is not a certification protocol. Its development evaluator is visible and repeatedly optimized; it advances one incumbent against one scalar; its `results.tsv` is intentionally left untracked; and it has no sealed calibration, blind, challenge, or post-freeze audit boundary. SynAc therefore adopts the mechanism, not upstream's evidentiary claims.

| Concern | Upstream autoresearch | SynAc adaptation |
|---|---|---|
| Human-controlled instructions | Human edits `program.md` | Same; campaign contract is frozen before execution |
| Mutable code | Agent edits only `train.py` | Agent edits only `experiments/tagging/candidate.py` |
| Fixed harness | `prepare.py` and evaluator are read-only by instruction | Harness, splits, labels, catalogs, and budgets are immutable and hash-verified outside the candidate sandbox |
| Budget | Fixed five-minute training time per run | Fixed per-run and aggregate wall time, memory/accelerator, experiment count, and hosted token/request/dollar ceilings |
| Objective | Minimize one validation metric | Satisfy provisional per-tag precision, then maximize useful coverage on development evidence; retain a cost/stability Pareto set |
| Search state | One branch advances or discards changes | Every candidate commit remains addressable; incumbent changes are reversible; no destructive reset |
| Result record | Five-column, untracked TSV | Append-only JSONL plus immutable logs/predictions, all with stable hashes |
| Final evidence | Reused development evaluator | Calibration, population, challenge, and audit labels live in separately authorized evaluator contexts |

## Evidence partitions and leakage boundary

The taxonomy contract, annotation protocol, and concept-family grouping must be frozen before campaign preparation. Every entry has an immutable `entryKey`, content hash, concept-family ID, source ID, and annotation version. Every run verifies the taxonomy, corpus, annotations, family groups, and split manifests by digest.

The initial adjudicated corpus has four roles:

| Partition | Size | Permitted use | Visibility during autonomous search |
|---|---:|---|---|
| Development | 800 entries | Training and grouped out-of-fold candidate comparison | Training-fold labels only; held-out-fold inputs are unlabeled to candidate code |
| Calibration | 300 entries | One preregistered fit of per-tag calibrators and lane thresholds after shortlist freeze | None |
| Population test | 300 entries | One final estimate on an untouched random population sample | None |
| Challenge | 100 entries | One final safety/ambiguity gate on preregistered hard cases | None |

Predicted-positive certification audits are additional evidence drawn after freeze from a pool that was never used in the 1,500-entry development corpus. Audit examples and labels remain invisible until the audit plan fixes the candidate generation, tag, sampling frame, sample size or sequential rule, random seed, and adjudication process.

Concept families and near-duplicates must remain within a single development fold and within a single top-level partition. Grouping is computed before labels are exposed to the optimizer. Source balancing may be used inside the grouping constraint, but source identity must not permit a duplicate or derivative term to cross folds.

The autonomous agent may receive:

- the candidate interface and frozen taxonomy contracts;
- development training-fold inputs and labels;
- held-out development inputs without labels;
- aggregate grouped out-of-fold metrics and bounded diagnostic summaries; and
- its own prior hypotheses, commits, logs, and ledger records.

It may not receive:

- held-out development labels or per-row correctness results;
- calibration, population-test, challenge, or audit inputs paired with labels;
- examples selected because of errors on sealed evidence;
- accepted/rejected status derived from sealed evidence as a feature or training label; or
- network or filesystem paths that can retrieve sealed data.

The evaluator runs in a separate process identity or job with read access to the relevant labels. Candidate execution receives only an ephemeral input mount and a write-only output location. During local autonomous experiments, network access is disabled after approved dependencies and exact model weights have been staged. Hash checking is necessary but not sufficient: access controls must prevent the candidate from reading the hidden files whose hashes are being checked.

## Immutable harness and mutable candidate surface

The prototype must preserve this ownership boundary:

```text
experiments/tagging/
  program.md       # human-owned campaign instructions
  prepare.py       # immutable corpus, split, and model preparation
  evaluate.py      # immutable schema checks, metrics, budgets, and ledger writer
  candidate.py     # sole agent-editable file
  splits/          # immutable manifests; labels inaccessible to candidate runtime
  results.jsonl    # evaluator-owned append-only campaign ledger
```

Before each run, the evaluator verifies the approved hashes for:

- corpus and entry content;
- taxonomy contracts and version;
- adjudicated labels and annotation version;
- concept-family grouping and split manifests;
- `prepare.py`, `evaluate.py`, ledger schema, and candidate interface;
- dependency lock, interpreter/runtime, approved model catalog, and exact weights;
- campaign configuration, seeds, and resource ceilings; and
- the parent candidate commit.

A mismatch stops the run before inference and appends an invalid-run record. The evaluator, not `candidate.py`, determines folds, reads held-out labels, computes metrics, enforces time/resource budgets, and writes the ledger. Candidate output is data only; it cannot execute callbacks in the evaluator. Reject missing rows, duplicate entry/tag pairs, unknown tags, out-of-range or non-finite scores, schema/version drift, unexpected files, timeout, out-of-memory, and budget overflow.

The candidate interface produces one raw score per `(entryKey, tagSlug)` for every requested pair. It does not emit final lane labels during development. The evaluator applies the currently preregistered provisional development thresholds only for comparison; the final per-tag calibrators and thresholds do not exist until the shortlist is frozen.

## Preregistration and budgets

Each campaign begins with a human-approved manifest. No expensive execution starts until the human approves the exact budget. The manifest fixes:

- campaign generation and fresh branch;
- corpus, taxonomy, split, evaluator, dependency, and weight hashes;
- admitted classifier families and unchanged family baselines;
- runner class, CPU/GPU model, accelerator count, memory ceiling, and storage limit;
- seeds and deterministic-mode policy;
- per-run timeout, aggregate wall-clock limit, and maximum experiment count;
- cold-cache and warm-cache measurement procedure;
- hosted model endpoints, exact model versions, token/request ceilings, and maximum actual dollars, if any;
- development metrics, provisional threshold rule, Pareto dimensions, tie-break order, and minimum meaningful deltas;
- confirmation-run count and allowable assignment-flip/score-variance limits; and
- stop, crash-recovery, and human-escalation rules.

The recommended first campaign ceiling is eight aggregate wall-clock hours and at most 96 experiments. Every admitted family receives an unchanged baseline before any family consumes more than half the aggregate budget. Every finalist receives three confirmation runs. Hosted ceiling candidates have separate token, request, and dollar budgets; unused local time cannot silently become hosted spend.

Budgets are hard ceilings, not targets. The campaign stops when any aggregate ceiling is reached. Invalid and failed attempts consume the wall-clock and hosted resources they actually used. A human may authorize a new campaign manifest, but must not enlarge a running campaign after seeing a near-passing result.

## Autonomous development loop

Run unchanged baselines first. Then repeat until a declared stop condition:

1. Inspect the current candidate commit, ledger, and development-only results.
2. State one falsifiable hypothesis and the expected metric/resource effect.
3. Edit only `candidate.py` and commit the change before evaluation.
4. Verify immutable hashes and launch the candidate inside the restricted runtime.
5. Train on each grouped training fold; score the corresponding unlabeled held-out fold.
6. Have the separate evaluator pool held-out predictions, compute metrics, measure resources, validate outputs, and append one complete ledger record.
7. Classify the experiment as `keep`, `pareto`, `discard`, `crash`, `timeout`, or `budget-exceeded` under the preregistered policy.
8. Continue from an approved incumbent or a retained Pareto candidate using a new commit or branch. Never use `git reset --hard`; discarded commits remain auditable.
9. Periodically rerun unchanged incumbents to estimate stochastic noise and environment drift.

An experiment that crashes may receive a narrowly scoped repair only when the original hypothesis remains unchanged. A material algorithm change is a new hypothesis and experiment ID. Empty or partial output never inherits results from a prior run.

## Development objective and Pareto policy

Grouped out-of-fold predictions are pooled once per candidate. For each tag, the evaluator records confusion counts and an exact one-sided 95% lower precision bound for the provisional `AUTO` region. A tag contributes to automatic coverage only when its provisional bound is at least 98%. This development constraint is a search guardrail, not certification.

Among candidates that satisfy the provisional constraint for at least one useful automatic tag, compare in this lexicographic order:

1. entries receiving at least one provisional automatic tag;
2. assignment-level automatic recall;
3. useful `REVIEW` suggestions under the frozen review-utility metric;
4. recurring full-corpus cost and accelerator seconds;
5. cold/warm latency, peak memory, model bytes, and network use;
6. assignment flips and score variance over confirmation runs; and
7. implementation simplicity.

Do not reduce quality, coverage, cost, and stability to a hand-tuned weighted score. Maintain the non-dominated Pareto set across automatic coverage, recurring resource cost, and stability. A candidate that costs less or is more stable may remain `pareto` even when it is not the coverage leader. `keep` identifies the current lexicographic incumbent; `discard` means the candidate is dominated or fails a preregistered materiality rule. The human freezes a small shortlist from the development Pareto set before any sealed evidence is opened.

No candidate may gain coverage by lowering the 98% precision floor. Tags without enough provisional positive evidence remain `REVIEW`/`ABSTAIN` and do not invalidate otherwise useful candidates.

## Append-only experiment ledger

`results.jsonl` is evaluator-owned and append-only. Every attempted run, including preflight and infrastructure failures after an experiment ID is issued, has exactly one terminal record containing:

- experiment ID, candidate commit, parent commit, campaign generation, timestamp, and hypothesis;
- terminal status: `keep`, `pareto`, `discard`, `crash`, `timeout`, or `budget-exceeded`;
- model, weight, prompt, feature, configuration, taxonomy, corpus, annotation, split, evaluator, dependency-lock, and runner-image hashes;
- seed, runner ID, hardware inventory, runtime/driver versions, and deterministic-mode flags;
- training, cold inference, warm inference, evaluation, and total wall time;
- CPU/GPU seconds, peak resident/accelerator memory, model bytes, disk reads/writes, and network bytes;
- hosted input/output/cached tokens, requests, provider-reported model version, and actual dollars where applicable;
- per-tag confusion counts, provisional precision lower bounds, and thresholds used for development comparison;
- `AUTO`, `REVIEW`, and `ABSTAIN` counts, entry coverage, assignment coverage, and review utility;
- confirmation-run label flips and score variance when applicable;
- candidate-output, prediction, stdout/stderr, environment, and log artifact hashes; and
- evaluator version, previous-record hash, and record hash.

The campaign artifact includes the ledger, its schema, immutable logs/predictions, and a final manifest hash. The previous-record hash makes deletion or reordering evident; signed CI artifacts or a committed final ledger anchor the chain. Unlike upstream's intentionally untracked TSV, the SynAc ledger must survive the research branch and be linked from the decision ticket.

## Reproducibility and stability

A candidate is reproducible only when another run can resolve the exact code, data, taxonomy, annotations, dependencies, model weights, prompt/features, configuration, seeds, evaluator, and runner class by hash. Floating model names, mutable API aliases, unpinned packages, and unrecorded prompts disqualify the result.

Cold and warm measurements are separate because model download/loading and cached inference have different operational consequences. Network bytes are zero for autonomous local candidates after setup. Hosted candidates record provider usage and actual invoiced or API-reported cost; a nominal price-table estimate is supplemental, not a substitute.

Deterministic candidates must produce identical assignments across three confirmation runs. Candidates with unavoidable nondeterminism must remain within preregistered limits for per-entry label flips and per-tag score variance. A finalist that crosses those limits fails; the limit is not widened after inspection. Incumbent reruns during development establish the noise floor used by materiality rules.

## Freeze and unsealing state machine

One campaign generation moves only forward through these states:

```text
DEVELOPMENT
  -> SHORTLIST_FROZEN
  -> CALIBRATED
  -> BLIND_EVALUATED
  -> AUDITED
  -> RELEASE_DECIDED
```

### `DEVELOPMENT`

Only grouped development evidence is available. The agent may iterate within the campaign budget. A human selects the shortlist using development evidence only.

### `SHORTLIST_FROZEN`

Freeze candidate code, features, prompts, dependencies, exact weights, seeds, output schema, and full-corpus unlabeled predictions. Record the generation manifest. No candidate may enter after calibration starts.

### `CALIBRATED`

After explicit human authorization, a separate evaluator uses the 300 calibration labels to fit the preregistered calibrator and `AUTO`/`REVIEW`/`ABSTAIN` thresholds independently per tag. It exposes aggregate calibration artifacts needed downstream, not individual examples or an error browser. There is no manual threshold adjustment after inspecting outcomes.

Calibration is part of the frozen pipeline, not another autonomous search round. Any candidate, feature, prompt, model, calibrator procedure, or threshold change creates a new generation. If the change was informed by calibration evidence, the old calibration set is no longer untouched evidence for choosing that change; the new generation needs a fresh sealed calibration allocation.

### `BLIND_EVALUATED`

After explicit authorization, run each calibrated finalist once on the 300-entry population test and 100-entry challenge set. A generation gets one unsealing. The evaluator may publish the preregistered aggregate release metrics only after every finalist's predictions are irrevocably recorded.

Blind and challenge results can reject a generation, but cannot select a repair, tune a threshold, or choose among post-hoc slices. A rejected generation returns to `DEVELOPMENT`; any successor is a new generation and requires fresh blind/challenge evidence for certification. Previously unsealed examples may be used later as development data only after they are retired from sealed status and versioned accordingly.

### `AUDITED`

For every tag proposed for `AUTO`, freeze its predicted-positive population, draw the preregistered random audit sample, and obtain blind human adjudication. Neither model proposals nor the model's rationale may adjudicate its own output. Calculate the exact one-sided 95% precision lower bound. Insufficient tags remain review-only.

Audit failures reject that tag's automatic lane for the generation. They do not authorize threshold changes against the same sample. If a later generation changes the threshold or classifier, it must draw fresh predicted-positive certification evidence.

### `RELEASE_DECIDED`

Apply mandatory precision and challenge gates first. Among passing candidates, choose the best certified automatic entry coverage; prefer the best local candidate when it is within one absolute percentage point of the best passing candidate. If not, a human resolves the hosted/local trade-off. Recurring cost, stability, simplicity, model size, and operational dependencies break remaining ties.

## Certification sample-size consequence

For an all-success sample of size `n`, the exact one-sided 95% Clopper-Pearson lower bound is:

```text
L = 0.05^(1/n)
```

Requiring `L >= 0.98` yields `n >= 149`. Thus approximately 149 independently and blindly adjudicated predicted-positive examples **with zero errors** are required for each automatic tag. This is a best case, not a default audit size. Any observed error requires a larger fixed sample to maintain the same lower bound.

The sampling design must be fixed before labels are opened. Permitted designs are:

- a single fixed sample size chosen for the preregistered tolerated error count; or
- a preregistered group-sequential design with explicit looks and alpha allocation.

Repeatedly adding examples until the ordinary fixed-sample interval passes is not permitted. Audit draws must be random from the frozen predicted-positive population, with no missing adjudications or substitution of inconvenient examples. Per-tag confidence is individual rather than family-wise, matching the product requirement. The [original Clopper-Pearson paper](https://doi.org/10.1093/biomet/26.4.404) defines the exact binomial construction; the 149 result above follows directly from its zero-error lower-bound equation.

The audit burden is deliberately separate from the 1,500-entry development corpus. If a rare tag cannot supply enough fresh predicted-positive evidence under the preregistered design, its automatic lane remains disabled. Human-adjudicated assignments may still populate the public tag when the taxonomy publication rules and 25-entry minimum are met.

## Human checkpoints

Human approval is mandatory at these boundaries:

1. Freeze taxonomy contracts, annotation version, concept families, and split protocol.
2. Approve candidate families, staged weights/dependencies, runner, seeds, and compute/hosted-spend budget immediately before the expensive campaign.
3. Review the development Pareto set and freeze the calibration shortlist.
4. Authorize one-time calibration unsealing.
5. Confirm frozen predictions and authorize one-time population/challenge evaluation.
6. Approve each per-tag certification sampling plan before draws or labels are revealed.
7. Adjudicate audit labels independently of model proposals.
8. Apply release gates and resolve any hosted/local trade-off.

The agent may propose hypotheses and candidates, but may not expand budgets, revise immutable machinery, unseal evidence, adjudicate labels, lower gates, or approve release.

## Required mechanical failure tests

Before the first expensive campaign, the harness prototype must demonstrate that:

- candidate code cannot read calibration, population-test, challenge, or audit labels;
- held-out development labels are available only inside the evaluator;
- concept-family duplicates cannot cross folds or top-level partitions;
- evaluator, split, taxonomy, corpus, dependency, or weight drift stops the run;
- invalid schema, missing output, duplicate rows, NaN/Infinity, crash, timeout, OOM, and budget overflow yield terminal ledger records;
- unchanged baselines and deterministic candidates reproduce under the pinned runner;
- a Pareto-improving non-coverage leader remains addressable;
- discarded changes return safely to the incumbent without destructive reset;
- blind/challenge evaluation cannot run twice for one generation;
- audit failure cannot expose examples to the autonomous loop or trigger same-sample threshold tuning; and
- aggregate campaign ceilings stop further launches.

## Resolution

Karpathy's method is appropriate for SynAc only inside the 800-entry grouped development sandbox. The adopted protocol keeps the upstream fixed-harness/mutable-candidate/bounded-loop discipline, but final evidence is protected by separate execution contexts and human-gated, one-time unsealing. Candidate selection remains development-only; calibration fits a frozen generation; blind, challenge, and predicted-positive audits only certify or reject. The durable append-only ledger records accuracy, coverage, stability, compute, and actual hosted cost, and the Pareto policy preserves useful local/cost-efficient candidates without ever trading away the per-tag 98% precision floor.
