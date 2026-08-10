# SynAc Synthetic Reference v1

Status: source-verifiable control reference ready; model-panel target labeling is
research-only and is not semantic ground truth.

## Frozen generation

- Protocol: `synac-ai-adjudication-v1`
- Run: `synac-reference-v1-20260810`
- Manifest: `sha256:9c134ed97d45ba4a386c00084d366a1f37f6cdb8dd0784def3b6bfddea7cdf90`
- Corpus: `sha256:ee3da6f5bf6a1cff9120f6a5ff50f61c9c2ad62145dcf9c67d9b0d5c1084502b`
- Rubric: `sha256:ce41900dc1daa8b17e02720b26e781aada203f8a7d0bc76c7eb23f4c1c9ed1cc`
- Controls: `sha256:94877bd52c477c92664b71f425fd7df8e6392bad6d158394a0e49e4f36c4d548`
- Split: `sha256:3673c60f8045b39da4cb0309070952e37a83e6ffe3c450795c11bae64d0087a6`
- Injection packets: `sha256:b116a9396e4762d9ea4f2c8b232d0cd4cf9038e9e0eea58585bd17c10699337a`
- Code: `sha256:104c1c4c8726799302fb44f7e5720d5d8716842818c6b4809a7e0c0d2f8954d6`
- Runtime: `sha256:a19daa133a5433b76f12b967b7df260702e43dcf8e5bc75f676943936fa75b4a`
- Models: `sha256:232d60e3e518693076f102eeeecdc5fc3ae7ba82f9ce47b99a8ea62cc3359655`

The immutable plaintext staging artifact lives outside Git at
`%LOCALAPPDATA%\SynAc\reference-staging\reference-20260810-v8`. Raw model
attempts live only in the role-encrypted external store. Repository history
contains the builders, validators, reviewed controls, and hashes.

## Rows and splits

- Corpus frame: 1,500 Entries.
- Family-safe allocation: 800 development, 300 calibration, 300 population
  validation, 100 challenge/audit.
- Concept families: 1,185; every family is confined to one split.
- Source-verifiable controls: 660 Entry/Tag cells.
- Per Tag: 30 positive and 30 negative; no shortfall across T01-T11.
- Public controls: 110, five positive and five negative per Tag.
- Adversarially authored and reviewed controls: 550, 25 positive and 25
  negative per Tag.
- Prompt-injection packets: 44, four per Tag.

Every reviewed row binds an Entry content hash, live sense key, exact
case-sensitive quote, polarity-compatible rule ID, rationale, distinct primary
and secondary reviewer IDs, and reviewed-file hash. Family/anchor collisions,
foreign or stale Entries, missing senses, inexact quotes, duplicate cells,
invalid rules, and reused reviewer identities fail mechanically.

## Adversarial review

Final accepted reviewer pairs:

- `primary-lane-a` / `secondary-lane-c`: 200 cells.
- `primary-lane-b` / `secondary-lane-a`: 200 cells.
- `primary-lane-c` / `secondary-lane-b`: 150 cells.

The reviewers raised and resolved objections about source centrality, incidental
mentions, rule polarity, exact quote provenance, acronym/full-name duplication,
concept-family leakage, and hard-negative boundaries. All 550 final cells have
two distinct reviewer attestations and no unresolved objection or abstention.

The draft process was iterative rather than a preregistered blind vote ledger,
so this generation does **not** claim a raw primary/secondary agreement rate or
human inter-annotator agreement. Final reviewer acceptance is 550/550 after
revision; that number must not be presented as initial agreement.

## Sealing and leakage controls

- AES-256-GCM append-only records with separate primary, critic, arbiter, and
  auditor role keys.
- Keys are DPAPI-protected outside the repository and exist in process memory
  only for the relevant role.
- Pointer NDJSON contains hashes and sealed IDs, never prompts, decisions,
  evidence, raw output, or labels.
- Seal replay, foreign-role access, missing seals, tampering, wrong keys,
  plaintext leakage, split drift, corpus drift, model drift, and runtime drift
  are tested fail-closed.
- Candidate code cannot read calibration, validation, challenge, audit, or raw
  role records.

## Live qualification pilot

The final v8 Qwen3 8B smoke used the pinned digest, Ollama 0.32.6, temperature
zero, seed 189, no tools, and `num_ctx=8192`.

- Terminal jobs: 7.
- Attempts: 10.
- Valid attempts: 7.
- Invalid attempts recovered by the one allowed identical retry: 3.
- Terminal abstentions: 0.
- Transport errors: 0.
- Median attempt time: 17,562 ms.
- Maximum attempt time: 73,327 ms.

The invalid attempts were one counterargument over 60 words and two non-JSON
model outputs. No response was repaired. Earlier immutable generations exposed
and fixed empty affirmative evidence, impossible evidence fields, wrong-polarity
rules, unbound root identifiers, and an incorrect 32K context. Each became a
mechanical grammar or validator regression before v8.

## Claim and production boundary

This is a Synthetic Reference and protocol-conformance artifact. It is not
human gold, ground truth, expert certification, or proof of real-world semantic
accuracy. Exhaustively labeling 1,500 Entries by model consensus would not turn
correlated model output into truth and is not a production release dependency.

For the initial production backfill, Terra Max only proposes candidates. Both
order-reversed passes must agree, and every advancing assignment receives full
independent Granite and Gemma evidence review. Any disagreement, invalid quote,
injection signal, malformed output, unavailable model, or incomplete run
abstains. No unreviewed scheduled or request-time automatic lane exists.
