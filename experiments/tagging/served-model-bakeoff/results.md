# Served-model public-anchor results

Benchmark hash: `28ae4540e3c7e84564e1e4fd0c337d80105ebb13d6b34c569329c75ccf2c465b`

| Rank | Model | Effort | Schema | Balanced accuracy | Macro-F1 | Worst Tag | Abstain | Mirror flips | Elapsed |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | gpt-5.6-luna | high | PASS | 100.0% | 100.0% | 100.0% | 0.0% | 0.0% | 75.4s |
| 2 | gpt-5.6-terra | xhigh | PASS | 100.0% | 100.0% | 100.0% | 0.0% | 0.0% | 90.0s |
| 3 | gpt-5.6-luna | max | PASS | 100.0% | 100.0% | 100.0% | 0.0% | 0.0% | 189.2s |
| 4 | gpt-5.6-luna | xhigh | PASS | 100.0% | 100.0% | 100.0% | 0.0% | 0.0% | 266.8s |
| 5 | gpt-5.6-terra | low | PASS | 99.1% | 99.1% | 90.0% | 0.0% | 0.0% | 40.7s |
| 6 | gpt-5.6-terra | high | PASS | 98.2% | 98.2% | 90.0% | 0.0% | 0.0% | 19.2s |
| 7 | gpt-5.6-terra | max | PASS | 98.2% | 98.2% | 90.0% | 0.0% | 0.0% | 242.5s |
| 8 | gpt-5.6-terra | medium | PASS | 97.3% | 97.3% | 90.0% | 0.0% | 0.0% | 85.4s |
| 9 | gpt-5.6-luna | medium | PASS | 89.1% | 89.1% | 60.0% | 0.0% | 0.0% | 179.9s |
| 10 | gpt-5.6-luna | low | PASS | 80.9% | 80.8% | 50.0% | 0.0% | 0.0% | 0.0s |



Abstentions count as errors. Each metric pools the original-order and
reverse-order passes. “Worst Tag” is the minimum balanced accuracy across the
eleven contracts. Elapsed time is agent-session wall time, not raw Responses API
latency.

## Decision

No configuration is promoted or certified from this pilot. These are public
normative anchors, their 5/5 per-Tag balance is disclosed, and the corrected v2
reruns followed an invalid v1 run in the same agent/file lanes. The
collaboration agents could choose scripts or reuse their owned artifact, so the
perfect scores, zero flips, and timestamps do not measure independent raw-model
accuracy, stability, or latency.

Advance only three served configurations to a fresh, uniform Batch evaluation
after the staged synthetic reference exists:

- Luna `high`: economical family candidate and best valid aggregate screen;
- Terra `low`: cheapest Terra effort and near-ceiling screen; and
- Terra `xhigh`: Terra quality ceiling for the hard/disagreement stratum.

Luna `low` and `medium` do not advance. Luna `xhigh`/`max` add no screen quality
over `high`; Terra `medium`/`high`/`max` add no screen quality over the retained
Terra pair. This is a Pareto-pruning decision for the next experiment, not a
production-model choice. The next evaluation must use one immutable prompt and
schema through the Responses/Batch API, fresh non-public cases, exact response
usage, and no agent tools or prior raw artifacts.

This public-anchor pilot is a contract-comprehension screen, not unseen-corpus
accuracy or release certification. The collaboration runner does not expose
billable input, cached-input, output, or reasoning-token counts, so exact dollar
cost cannot be reconstructed from these runs. Current official synchronous
rates are $0.20 input / $1.20 output per million tokens for Luna and $2.00 /
$12.00 for Terra; Batch halves those rates. A production-like Batch qualification
must archive response usage before cost can enter the final selection rule.
