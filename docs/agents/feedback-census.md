# Feedback census

Recurring review findings and owner preferences for SynAc. Collected 2026-10-16 for cleanup step 1 (AP-20261016-01).

## Scope

- PR Checker verdict for [#242](https://github.com/amanthanvi/synac/pull/242), through the APPROVED snapshot on `488d579` (2026-10-15, 19:46 ET).
- Issues [#183](https://github.com/amanthanvi/synac/issues/183) through [#201](https://github.com/amanthanvi/synac/issues/201). Counted comments are authored by `amanthanvi`.
- Inline review comments by `greptile-apps[bot]` and `coderabbitai[bot]` on pull requests [#237](https://github.com/amanthanvi/synac/pull/237) through [#244](https://github.com/amanthanvi/synac/pull/244).

## How items are counted

- One top-level inline comment by Greptile or CodeRabbit. There are 14. Replies are not separate items.
- One `amanthanvi` comment that states a durable rule. There are 18 of 31 comments. The other 13 are status or execution logs.
- One distinct approval gate in the #242 PR Checker verdict. There are 4.

Each item is listed under one theme. A later comment that only repeats a rule is named in prose and is not counted again.

| Theme | Items |
| --- | ---: |
| Synthetic reference stays labeled synthetic | 6 |
| Verify runs touch only their own processes and files | 5 |
| Evaluation stays leakage-safe and frozen | 5 |
| Taxonomy contracts stay narrow and corpus-backed | 5 |
| Approval matches the reviewed head | 4 |
| Public text matches the pin or the bound | 3 |
| Classification stays offline and rollouts stay staged | 2 |
| Missing input and local errors fail closed | 2 |
| Tests cover the caller-visible behavior | 2 |
| An older writer does not replace a newer result | 2 |

## Synthetic reference stays labeled synthetic (6)

Owner comments. The reference set is a reproducible weak reference, and production text calls it synthetic.

- Ship the frozen protocol and provenance without calling the evidence human gold. The close records no human-ground-truth claim and no real-world 98% precision claim. [183](https://github.com/amanthanvi/synac/issues/183#issuecomment-5273272781).
- The synthetic evaluator replaces the human-gated boundary. Panel output may assess protocol conformance. It is not human ground truth. [186 addendum](https://github.com/amanthanvi/synac/issues/186#issuecomment-5211703010).
- A publication count accepts a passing synthetic generation or a manual override. Raw predictions stay out of that count. Ambiguity stays an abstention. Majority vote does not force a label. [187 addendum](https://github.com/amanthanvi/synac/issues/187#issuecomment-5211703090).
- Protocol `synac-ai-adjudication-v1` uses `label_origin = synthetic_ai_panel`. It is a weak reference, not human gold, ground truth, expert validation, or independent semantic certification. [188 supersession](https://github.com/amanthanvi/synac/issues/188#issuecomment-5211703172).
- Model consensus over the 1,500-entry corpus is research evidence. Authority is 660 source-verifiable controls (30 positive and 30 negative per tag), each bound to a live entry, sense, quote, and frozen rule. A Terra proposal advances only on dual local `SUPPORT` at 90 or above with exact source evidence. [188 correction](https://github.com/amanthanvi/synac/issues/188#issuecomment-5237748850).
- Serving assignments carry entry, taxonomy, model, prompt, config, calibration, certification, and run provenance. Precedence is accepted snapshot, then manual `addTags`, then manual `removeTags`. Manual removal wins. Stale hashes, unknown tags, and low-threshold AUTO claims fail closed. [195](https://github.com/amanthanvi/synac/issues/195#issuecomment-5237829568).

## Verify runs touch only their own processes and files (5)

All five are Greptile comments on [#242](https://github.com/amanthanvi/synac/pull/242), "Add a SynAc verification skill and feature map".

- A launch that throws before the session is recorded leaves Convex running, and cleanup cannot see it. [P1, 4282603023](https://github.com/amanthanvi/synac/pull/242#discussion_r4282603023).
- A saved PID can belong to a different process later. Cleanup has to show the process is still the one launch started. [P1, 4282603055](https://github.com/amanthanvi/synac/pull/242#discussion_r4282603055).
- Restore state is shared across checkouts. Launch from checkout B can apply checkout A's dirty-file list. [P1, 4283072380](https://github.com/amanthanvi/synac/pull/242#discussion_r4283072380).
- Edits a person makes during launch to watched files, including `AGENTS.md` and `convex.json`, are reverted on cleanup. [P1, 4283222034](https://github.com/amanthanvi/synac/pull/242#discussion_r4283222034).
- Running `cli.mjs` through the `.cursor/skills/verify-synac` symlink exits 0 without running checks, because `process.argv[1]` keeps the symlink path. [P1, 4283072394](https://github.com/amanthanvi/synac/pull/242#discussion_r4283072394).

## Evaluation stays leakage-safe and frozen (5)

- Admit the five requested classifier families. The reproducible control is frozen local embeddings plus independent calibrated logistic heads. [184](https://github.com/amanthanvi/synac/issues/184#issuecomment-5166637325).
- Autoresearch is a bounded loop: a hash-verified immutable harness, one mutable candidate surface, grouped out-of-fold development labels, hard compute and spend ceilings, and an append-only Pareto ledger. Calibration, population-test, challenge, and audit evidence may certify or reject a frozen generation. They stay unavailable for tuning. [186](https://github.com/amanthanvi/synac/issues/186#issuecomment-5166631072). That comment also asks for a 95% precision lower bound of at least 98% per AUTO tag. The later [183 close](https://github.com/amanthanvi/synac/issues/183#issuecomment-5273272781) refuses a real-world 98% precision claim. The [197 rollout gate](https://github.com/amanthanvi/synac/issues/197#issuecomment-5237830077) uses a separate figure, proposal confidence of at least 98.
- The staged frame is 1,500 entries: 800 development, 300 calibration, 300 population-test, and 100 challenge, family-safe, with preregistered rare-tag expansion only. The human-annotator requirement in this comment was superseded on 2026-08-06. The split frame was kept. [188](https://github.com/amanthanvi/synac/issues/188#issuecomment-5209901753), [supersession](https://github.com/amanthanvi/synac/issues/188#issuecomment-5211703172).
- The initial backfill selection is `gpt-5.6-terra` at reasoning effort `max`. A fresh open-weight candidate can still replace it under the local-first exception. [191](https://github.com/amanthanvi/synac/issues/191#issuecomment-5237473329).
- That selection stays provisional until the frozen real-run gates and adversarial review finish. [194](https://github.com/amanthanvi/synac/issues/194#issuecomment-5237475907).

## Taxonomy contracts stay narrow and corpus-backed (5)

- Use NIST, MITRE, and OWASP as evidence for boundaries. They describe outcomes, controls, adversary behavior, application risk, privacy, development practice, or roles, which is a different shape from one flat topic list. Lifecycle functions, tactics, roles, sources, entry types, platforms, and audience levels stay outside the topical dimension. [185](https://github.com/amanthanvi/synac/issues/185#issuecomment-5166644001). The five-tag publication sketch in that comment is earlier than the eleven-contract freeze below.
- Taxonomy v1 freezes eleven non-exclusive topical contracts. A tag applies only when the topic is central to the entry. Every contract has at least five corpus-backed positives and five hard negatives. A candidate is public only with a complete contract and at least 25 accepted assignments. The generic Protocols tag is retired. [187](https://github.com/amanthanvi/synac/issues/187#issuecomment-5209631448).
- Examples that contradict the compiled corpus force a taxonomy version bump. In v1, `command-and-control` pointed at a non-cyber military sense, and a vulnerability-management entry was used as a Vulnerabilities hard negative. Those generations stay barred from model selection. [187 correction](https://github.com/amanthanvi/synac/issues/187#issuecomment-5233388338).
- Specialist tags for software and application security, digital forensics, and social engineering stay deferred until a separately frozen rubric yields at least 25 source-central accepted entries. The deferral is a closed decision for taxonomy v2, and a later generation may reopen one tag. [201](https://github.com/amanthanvi/synac/issues/201#issuecomment-5273272318).
- On [#241](https://github.com/amanthanvi/synac/pull/241), Greptile reported that strict floors would fail a takedown that drops a published tag under 25 entries or 30% coverage ([4239294914](https://github.com/amanthanvi/synac/pull/241#discussion_r4239294914)). Greptile withdrew that finding in [4239327678](https://github.com/amanthanvi/synac/pull/241#discussion_r4239327678) after the contract was stated: strict mode checks the served corpus a tagging release would emit, and ordinary takedown PRs stay on the lenient check.

## Approval matches the reviewed head (4)

From the PR Checker verdict on #242. The 11:57 ET and 19:39 ET snapshots were CHANGES-NEEDED. APPROVED at 19:46 ET applies to `488d579` after the four gates below held on that SHA.

- The proof section names the head SHA.
- Required CI is green on that same SHA. It was still running at 11:57 ET and green by the 19:39 ET re-gate.
- Greptile has reviewed that SHA. A pass on an older SHA does not carry. The re-gate stayed open until `@greptileai review` produced a success on `488d579` ("45 files reviewed, 0 comments added").
- An open P1 from an older commit is fixed on the head, with an author reply. Thread [4285174751](https://github.com/amanthanvi/synac/pull/242#discussion_r4285174751) ("Tests now require tmux") stayed open until `pnpm test` and `pnpm gate` stopped invoking tmux and `pnpm test:verify-tmux` ran as its own required CI step. Author reply [4285216833](https://github.com/amanthanvi/synac/pull/242#discussion_r4285216833).

The same verdict records that CodeRabbit is skipped on this repo and is not an approval gate. Opus and Sol reviews were unavailable for that check.

## Public text matches the pin or the bound (3)

- Browse `meta.total` comes from the first 1,000 index rows when a letter bucket is larger. Changelog copy that says the total is the full bucket overclaims the API. [CodeRabbit on #238, 4240529621](https://github.com/amanthanvi/synac/pull/238#discussion_r4240529621), marked addressed in `61a897b`.
- An `actions/upload-artifact` pin at `v7.0.2` was still commented as `v7.0.0` in the ingest, quality, and security workflows. [Greptile on #244, 4250252246](https://github.com/amanthanvi/synac/pull/244#discussion_r4250252246).
- A pull request that pins an older action than the ref `main` already resolves is a downgrade. `github/codeql-action@v4` resolved to v4.37.8 while #200 pinned v4.37.4, and the PR was closed. [200](https://github.com/amanthanvi/synac/pull/200#issuecomment-5370741745).

## Classification stays offline and rollouts stay staged (2)

- Classification is offline, sparse, and event-triggered. Changed entry text invalidates the content hash and requires reclassification. Provider or local-model failure writes no serving artifact and keeps the previous generation. `pnpm gate` remains mandatory, and generated source bundles stay untouched by the workflow. [196](https://github.com/amanthanvi/synac/issues/196#issuecomment-5237829835).
- Rollout is two-phase: an additive versioned Convex backend first, then the reviewed taxonomy, assignment artifact, and web routing. Rollback reverts that content generation through the compatible forward sync path. [197](https://github.com/amanthanvi/synac/issues/197#issuecomment-5237830077).

The same offline rule is restated in the [183 close](https://github.com/amanthanvi/synac/issues/183#issuecomment-5273272781) and the [188 correction](https://github.com/amanthanvi/synac/issues/188#issuecomment-5237748850). Both are counted in the synthetic-reference theme.

## Missing input and local errors fail closed (2)

- `ingest --list --source` with no slug lists every enabled source, because the missing value becomes an unrestricted request. A present `--source` flag with an empty value should be rejected, with a subprocess test. [Greptile on #239, 4239209827](https://github.com/amanthanvi/synac/pull/239#discussion_r4239209827).
- The verify driver labeled every unsuccessful ingest `INCONCLUSIVE`, including an unknown adapter or a local exception, so `verify:drive` stayed successful. Reserve `INCONCLUSIVE` for a confirmed upstream or environment failure, and fail unexpected local errors. [Greptile P2 on #242, 4282603072](https://github.com/amanthanvi/synac/pull/242#discussion_r4282603072).

## Tests cover the caller-visible behavior (2)

- Browse tests covered `browseOffersNextPage` and the Convex query, and never called `browseResponse`, so a wrong `meta.hasMore` could still pass. [Greptile on #238, 4239207406](https://github.com/amanthanvi/synac/pull/238#discussion_r4239207406).
- A tmux session test inside `pnpm test` and `pnpm gate` fails where the documented setup is only Node and pnpm. The checker accepted the split: `test:verify-tmux` is a separate script, and required CI runs it after `pnpm test`. [Greptile P1, 4285174751](https://github.com/amanthanvi/synac/pull/242#discussion_r4285174751).

## An older writer does not replace a newer result (2)

- Per-source ingest locks stop simultaneous writes and still allow an older scheduled run to publish over a newer dispatch of the same source. [Greptile P1 on #239, 4239263202](https://github.com/amanthanvi/synac/pull/239#discussion_r4239263202).
- Removing the `api_v1_search` rate-limit scope while Convex and Vercel deploy separately makes uncached `/api/v1` reads return 500 until both sides match. Stage the scope: accept the old and new names, ship the web app, then remove the old name. [Greptile P1 on #240, 4239250455](https://github.com/amanthanvi/synac/pull/240#discussion_r4239250455). `docs/RELEASING.md` is the rollout doc Greptile cited.

## Rules later steps can turn into checks

Candidates only. This file does not add the checks.

1. Block a merge approval when the proof SHA, the green CI SHA, and the latest Greptile SHA differ, or when a Greptile P1 thread on the head is still open.
2. Keep `pnpm test` and `pnpm gate` limited to the Node and pnpm toolchain. Run optional integration tests, including tmux, from an explicit script in required CI.
3. Reject a present `--source` flag with an empty value. An omitted flag may still mean every enabled source.
4. Fail the verify driver on local ingest errors. Use `INCONCLUSIVE` only for a confirmed upstream or environment failure.
5. Flag a workflow comment whose version label disagrees with the pinned action SHA.
6. Flag API or changelog text that calls a bounded scan a full count.
7. On a tagging release, enforce the strict publication floor against the served corpus. Keep ordinary takedown PRs on the lenient check, matching the #241 withdrawal.
8. Refuse a dependency pin that resolves to an older version than the ref `main` already uses.
9. In verify launch and cleanup, record the session before the readiness wait, bind restore state to one checkout path, and signal a PID only after a start-time identity check.

## What this census leaves out

- Pull requests [#237](https://github.com/amanthanvi/synac/pull/237) and [#243](https://github.com/amanthanvi/synac/pull/243) had no Greptile or CodeRabbit inline comments in the review-comment API.
- Issues [#190](https://github.com/amanthanvi/synac/issues/190), [#193](https://github.com/amanthanvi/synac/issues/193), and [#199](https://github.com/amanthanvi/synac/issues/199) had no `amanthanvi` comment. #199 and #200 are Dependabot pull requests inside that issue range.
- Thirteen `amanthanvi` comments are status or execution logs: eight on [#189](https://github.com/amanthanvi/synac/issues/189), the raw-batch note and the campaign-complete note on [#191](https://github.com/amanthanvi/synac/issues/191), the batch-submitted note on [#192](https://github.com/amanthanvi/synac/issues/192), the real-run start on [#194](https://github.com/amanthanvi/synac/issues/194), and the execution-ready confirmation on [#198](https://github.com/amanthanvi/synac/issues/198).
- Sourcery is outside the source list. One Sourcery note on #239, about the ingest concurrency group dropping a pending dispatch, is omitted.
- The #242 verdict says earlier optional P3 items still stood if open. Those P3 texts are not in the attached verdict, so they are not itemized here.
