# Synthetic adjudicated reference harness

Dependency-free TypeScript staging harness for issue #189. It freezes the
11-tag rubric-v2 contract, compiles current SynAc content, groups concepts,
selects a family-safe 1,500-entry corpus, constructs source-backed controls and
injection probes, binds the inputs in a run manifest, and provides a role-keyed
AES-256-GCM sealed store. It does not call models or create synthetic labels.

## Immutable outputs

`build.ts` creates a new output directory and refuses to overwrite one. It
writes:

- `rubric.json`: exactly 11 `T01`-`T11` contracts, stable global/rule/anchor IDs;
- `corpus.json`: 1,500 canonical entry payloads and per-entry SHA-256 hashes;
- `split.json`: family-safe development/calibration/validation/audit partitions
  of 800/300/300/100 entries;
- `controls.json`: explicit public anchors plus validated source-reviewed controls,
  with per-tag shortages and raw reviewed-file hashes;
- `injection-packets.json`: four deterministic attacks per tag (44 total);
- `manifest.json`: corpus, rubric, split, controls, injection, code, runtime,
  and model-lineage hashes plus the derived master seed. `target-panel.ts` then
  implements the sealed target annotation, independent audit, gate, and
  development-only release protocol. No command calls a model except an explicit
  `panel ... run` or `target run` invocation.

Concept families conservatively union exact titles, normalized titles,
normalized slug/alias collisions, and exact normalized-definition hashes.
Single-token singular/plural titles are joined only when the same normalized
identity is corroborated by a slug or alias.
Families are indivisible. Every public-anchor or reviewed-control family is
forced into `development`; the builder fails if exact capacities cannot be
reached without splitting one.

Control calibration/validation assignment is also family-atomic across every
tag/polarity stratum. The deterministic solver targets the exact half count and
fails if family coupling makes it impossible. Exact duplicate tag/Entry cells
remain invalid, but distinct source-explicit controls in one transitive family
are retained together in the same half.

Without reviewed JSON, honest control availability is 5 positive plus 5
negative public anchors per tag: 110 controls, 550 short of the 660
qualification target. Exactly 25 positive and 25 negative rows per tag under
`reviewed-controls/` close that gap; see its README for the strict schema and
source-evidence rules. Until then, `controlsReady` remains false. This is a
mechanical protocol stop, not an invitation to infer labels from keywords,
production tags, or a model.

## Commands

From this directory:

```powershell
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run check
corepack pnpm run build:reference -- --models C:\external\models.json --runtime C:\external\runtime.json --output C:\external\synac-run-001
```

The monorepo's existing content-tool runner executes the build; this package
adds no dependencies. Model and runtime JSON are required, strictly validated,
and hashed. Direct lanes must be `P1`-`P4`, `A1`, `A2`; all six base families
must be disjoint, span at least four training organizations, and include one
open-weights hash. `C+` and `C-` must differ from one another and both arbiters.

Runtime shape:

```json
{
  "schemaVersion": "synac-runtime-config-v1",
  "runId": "synac-reference-001",
  "frozenAt": "2026-08-10T00:00:00.000Z",
  "temperature": 0,
  "seed": 189,
  "tokenLimit": 8192,
  "tools": false,
  "candidates": 1
}
```

See `ModelLineages` in `types.ts` for the exact model declaration. Do not use
aliases as extra families or invent ancestry/weights hashes.
Each Ollama `immutableModelId` must have the strict form
`ollama:<actual-tag>@<12-hex-digest>`, for example
`ollama:qwen3:8b@500a1f067a9f`. The full value stays in the immutable model and
manifest bindings. `/api/chat` receives only `<actual-tag>`.

## Local Ollama qualification panel

`local-panel.ts` implements source-control qualification. Both the immutable
artifact directory and the panel state directory must be absolute paths outside
the repository, so source control never receives control labels, prompts,
responses, or progress state.

```powershell
$env:SYNAC_SEALED_STORE_DIR = 'C:\external\synac-panel-001-sealed'
$env:SYNAC_SEALED_KEY_PRIMARY = '<canonical-base64-encoded-256-bit-key>'
$env:SYNAC_SEALED_KEY_ARBITER = '<different-canonical-base64-encoded-256-bit-key>'

corepack pnpm run panel -- qualify prepare `
  --artifacts C:\external\synac-run-001 `
  --models C:\external\models.json `
  --runtime C:\external\runtime.json `
  --state C:\external\synac-panel-001 `
  --endpoint http://127.0.0.1:11434 `
  --context 8192

corepack pnpm run panel -- qualify run --state C:\external\synac-panel-001
corepack pnpm run panel -- qualify report --state C:\external\synac-panel-001
```

The literal `--` is pnpm's script-argument separator. The panel CLI discards
that separator before reading `qualify prepare|run|report`.

Preparation requires all 660 honest controls and six direct `ollama` lanes
(`P1`-`P4`, `A1`, `A2`). It rejects corpus, rubric, control, injection, model,
runtime, or manifest drift. Each control and injection packet is rendered for
two exact inverse tag orders. Requests use `/api/chat`, strict JSON Schema,
`stream = false`, and the frozen temperature, seed, token limit, model ID, and
8,192-token context window. Preparation and saved-plan validation reject every
other context value before inference. No tools, labels, peers, or conversation
history are supplied.

External append-only files are split by role:

- `qualification-primary-progress.ndjson` and
  `qualification-primary-results.ndjson`;
- `qualification-arbiter-progress.ndjson` and
  `qualification-arbiter-results.ndjson`;
- immutable `qualification-plan.json` and `qualification-report.json`.

The progress and results NDJSON files are non-semantic indexes only. They hold
hashes, status/timing metadata, and sealed-record pointers; they never contain
prompts, raw model content, parsed responses, decisions, evidence, reasons, or
control labels. Every complete attempt outcome and terminal result is sealed
under its role key in `SYNAC_SEALED_STORE_DIR` before its pointer is synced.
`run` and `report` both require the primary and arbiter keys and authenticate
every referenced record in memory.

Every request has stable job/request/seal IDs; every attempt has a derived
response ID and model/timing/token provenance. Invalid transport, malformed
JSON, foreign identifiers, unknown rules/senses, or non-exact evidence quotes
receive one byte-identical retry. A second failure becomes an explicit
abstention. Completed terminal jobs are skipped on resume. A process crash
after `attempt_started` is conservatively abstained rather than called twice.
A crash after sealing but before pointer append recovers the deterministic
one-use seal and repairs the pointer without another model call. Missing,
foreign-role, replayed, or authentication-failed seals stop before transport.
Before the first inference transport in every `run`, the harness reads local
Ollama `/api/tags` and requires the installed tag's plain lowercase 64-hex
digest to begin with the pinned 12-hex digest. Missing tags, duplicate tags,
malformed catalog responses, or digest drift fail before `/api/chat`.
The response schema separates affirmative from negative/abstain decisions:
every `yes` requires at least one evidence item, while `no` and `abstain` may
leave evidence empty. Post-validation still requires each supplied quote to be
an exact substring of the named live sense field; schema constraints never
substitute for source verification.
Decisions use llama.cpp's supported fixed tuple-array `items` form, never its
broken `prefixItems`: each slot has the exact supplied-order Tag ID as a
constant. Its `yes`, `no`, and `abstain` arms enumerate only global plus that
Tag's inclusion, exclusion, or either-polarity rule IDs respectively. Root
request, Entry, rubric, seal, and target renderer echoes are also constants.
Post-validation repeats order, polarity, identity, and rule-uniqueness checks;
unsupported grammar keywords cannot weaken the sealed result contract.
Each request derives its evidence-item grammar from that exact Entry. It
enumerates only live sense keys; definition tuples; non-null label and expanded
form tuples; and exact zero-based example indices. The harness never repairs a
foreign tuple. Request construction fails before transport above 128 tuples or
an 8,192-byte evidence grammar, preventing per-entry schema expansion from
silently weakening the frozen 8,192-token context cap. Ollama exposes exact
prompt-token usage only in response metadata, so the harness does not claim an
unverifiable tokenizer estimate before generation.
Qualification execution is deterministically lane-major (`P1`-`P4`, `A1`,
`A2`), then mirror, control/injection kind, and job ID. This preserves every
immutable job/request/seal identity while avoiding model reload thrash.

The report fits per-lane/per-tag monotone calibration on the calibration half,
then computes held-out symmetric macro-F1, per-tag balanced accuracy with
abstentions as errors, ECE, Brier score, overall/per-tag mirror agreement,
injection failures, timing/tokens, and pairwise primary error phi. It applies
issue #188's `0.90`, `0.85`, `0.08`, `0.15`, `97%`/`95%`, zero-injection, and
`0.30`/`0.50` gates mechanically.

Controls are scored once per tag/polarity/concept-family group, not once per
Entry. A group is correct only when every member is correct; any missing,
abstaining, or conflicting member makes it incorrect. Mirror agreement requires
every member's mirrors to agree and all member predictions to agree. Reports
include both raw cell counts and unique-family counts for every
tag/polarity/half and fail on family leakage or an empty family stratum.

## Target annotation, audit, and release

`target-panel.ts` consumes the immutable 1,500-entry artifact and a passing
qualification report. The report must sit beside its immutable
`qualification-plan.json`; preparation verifies that plan's manifest, corpus,
rubric, model, and runtime bindings before deriving any target job. Target state
and release directories must be absolute and outside the repository.

All four independent role keys are required for every target command. Opening
all role stores up front lets the runner reject a deterministic seal written
under a foreign role before transport:

```powershell
$env:SYNAC_SEALED_STORE_DIR = 'C:\external\synac-target-001-sealed'
$env:SYNAC_SEALED_KEY_PRIMARY = '<canonical-base64-encoded-256-bit-key>'
$env:SYNAC_SEALED_KEY_CRITIC = '<different-canonical-base64-encoded-256-bit-key>'
$env:SYNAC_SEALED_KEY_ARBITER = '<different-canonical-base64-encoded-256-bit-key>'
$env:SYNAC_SEALED_KEY_AUDITOR = '<different-canonical-base64-encoded-256-bit-key>'

corepack pnpm run target -- prepare `
  --artifacts C:\external\synac-run-001 `
  --qualification-report C:\external\synac-panel-001\qualification-report.json `
  --models C:\external\models.json `
  --runtime C:\external\runtime.json `
  --state C:\external\synac-target-001 `
  --endpoint http://127.0.0.1:11434 `
  --context 8192

corepack pnpm run target -- run --state C:\external\synac-target-001 --phase primary
corepack pnpm run target -- run --state C:\external\synac-target-001 --phase critic
corepack pnpm run target -- aggregate --state C:\external\synac-target-001
corepack pnpm run target -- run --state C:\external\synac-target-001 --phase arbiter
corepack pnpm run target -- audit-prepare --state C:\external\synac-target-001
corepack pnpm run target -- run --state C:\external\synac-target-001 --phase verify
corepack pnpm run target -- report --state C:\external\synac-target-001
corepack pnpm run target -- release `
  --state C:\external\synac-target-001 `
  --output C:\external\synac-reference-release-v1
```

The target CLI likewise discards pnpm's literal `--` before reading its
top-level command.

`--limit N` on `target run` caps HTTP attempts for an operator-controlled
batch. Re-running the same phase authenticates and skips terminal jobs,
recovers sealed orphan records, and continues. A started attempt with no sealed
outcome becomes an abstention; it is never called again. Artifact/model/runtime,
qualification, plan, request, response, renderer, rule, sense, quote, role, and
seal drift are hard stops.

The fixed initial plan is 12,000 primary jobs (`1,500 × P1-P4 × two mirrored
tag orders`) plus 3,000 opposed critic jobs (`1,500 × C+/C-`). `aggregate`
collapses each primary mirror pair through its source-control calibrator, takes
deterministic 3-of-4 agreement, and creates four A1/A2 jobs per triggered Entry
(two argument-order passes per arbiter). Arbitration therefore adds 0-6,000
terminal jobs. The independent R2 audit adds two V1/V2 jobs per selected Entry:
at least 300 jobs for the seeded 150-Entry baseline, with whole-family,
tag/polarity-top-up, arbitration, injection, and unresolved inclusions, up to
3,000 jobs if all Entries are selected.
Target plans and execution are likewise phase/lane/model-major, then mirror and
job ID (`P1`-`P4`, `C+`/`C-`, `A1`/`A2`, `V1`/`V2`). Ordering carries no labels
or peer decisions and does not alter response packets.

Call budget:

- qualification: 8,448 terminal jobs; at most 16,896 HTTP attempts with retry;
- target fixed front: 15,000 terminal jobs; at most 30,000 HTTP attempts;
- target arbitration: 0-6,000 terminal jobs; at most 0-12,000 attempts;
- target audit: 300-3,000 terminal jobs; at most 600-6,000 attempts;
- total target: 15,300-24,000 terminal jobs; at most 30,600-48,000 attempts.

Each invalid transport/schema/provenance response receives exactly one
byte-identical retry. The budget is a hard upper bound, not a recommendation to
spend it; successful first attempts use one call.

`aggregate`, final adjudication, and the audit plan are label-bearing and are
AES-GCM sealed under arbiter/auditor keys. Plaintext state contains only the
immutable source-free job plan, hashes, status/timing, and sealed pointers. R2
requests contain raw source plus the frozen rubric only: no prior proposals,
accepted decisions, expected labels, or split-derived hints. Calibration,
validation, and audit decisions remain sealed.

`report` applies the frozen gates mechanically: coverage at least 90% overall
and 85% per tag; primary mirror instability at most 3% overall and 5% per tag;
V1/V2 agreement at least 95% overall and 90% per tag/polarity; a deterministic
10,000-replicate concept-family-clustered bootstrap lower bound of 0.90; zero
accepted injection, seal, or provenance failures; and at least 25 accepted
development positives per published tag. Undersampled or failing
tag/polarity strata are quarantined and block the release gate.

`release` is one-use: its external output directory must not already exist. It
writes only `development-reference.json` (800 Entries, accepted positive tag
projection), opaque hash bindings in `release-manifest.json`, aggregate
`integrity-report.json`, aggregate `datasheet.json`, and a release marker.
Calibration, validation, audit, negative, unresolved, raw-attempt, proposal,
and evidence payloads are never emitted. The designation is explicitly
“reference set, not gold.”

## External sealed store

`sealed-store.ts` requires an absolute `SYNAC_SEALED_STORE_DIR` outside the
repository and one independent base64-encoded 256-bit environment key per
role:

- `SYNAC_SEALED_KEY_PRIMARY`
- `SYNAC_SEALED_KEY_CRITIC`
- `SYNAC_SEALED_KEY_ARBITER`
- `SYNAC_SEALED_KEY_AUDITOR`

Generate and inject keys through the process secret manager; never put them in
arguments, JSON, logs, source control, or the output manifest. `appendSealedRecord`
validates before encryption, rejects reused seal IDs, authenticates role and
seal as AES-GCM additional data, appends one ciphertext envelope, and syncs the
file. `readSealedRecord` requires the expected role and one-use seal, verifies
the authentication tag, parses in memory, validates, and zeroes key/plaintext
buffers. The implementation assumes one writer per role file; coordinate
concurrent writers above this layer. Long-running panel commands open one
single-writer role session, index the append-only envelopes once, and update the
in-memory index after each append; 8,448-job runs do not rescan the whole file
for every record.
