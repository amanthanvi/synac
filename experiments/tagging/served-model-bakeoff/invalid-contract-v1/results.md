# Served-model public-anchor results

Benchmark hash: `7a0cca606bfe41fbaf9b300cbebdae4fef0a6d75323d598d37237eb651da3db3`

| Rank | Model | Effort | Schema | Balanced accuracy | Macro-F1 | Worst Tag | Abstain | Mirror flips | Elapsed |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | gpt-5.6-luna | high | PASS | 97.3% | 97.3% | 80.0% | 0.0% | 0.0% | 333.5s |
| 2 | gpt-5.6-terra | xhigh | PASS | 96.4% | 96.4% | 80.0% | 0.0% | 0.0% | 150.5s |
| 3 | gpt-5.6-luna | xhigh | PASS | 96.4% | 96.4% | 80.0% | 0.0% | 0.0% | 242.5s |
| 4 | gpt-5.6-luna | max | PASS | 96.4% | 96.4% | 80.0% | 0.0% | 0.0% | 300.3s |
| 5 | gpt-5.6-terra | low | PASS | 96.4% | 96.4% | 80.0% | 0.0% | 0.0% | 144.3s |
| 6 | gpt-5.6-luna | low | PASS | 80.0% | 79.9% | 50.0% | 0.0% | 0.0% | 45.8s |
| 7 | gpt-5.6-terra | high | FAIL | 96.4% | 96.4% | 80.0% | 0.0% | 0.0% | 52.9s |
| 8 | gpt-5.6-terra | medium | FAIL | 95.5% | 95.5% | 80.0% | 0.0% | 0.0% | 338.7s |
| 9 | gpt-5.6-luna | medium | FAIL | 94.5% | 94.5% | 70.0% | 0.0% | 0.0% | 210.4s |

## Validation failures

- `terra-high.json`: terra-high.json/681cbb7d12581e7c/passA: unknown rule ID exclude:5
- `terra-high.json`: terra-high.json/681cbb7d12581e7c/passB: unknown rule ID exclude:5
- `terra-medium.json`: terra-medium.json/681cbb7d12581e7c/passA: unknown rule ID exclude:5
- `terra-medium.json`: terra-medium.json/681cbb7d12581e7c/passB: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/af6646e7182baa88/passA: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/af6646e7182baa88/passB: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/dd4c5284947aee8d/passA: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/dd4c5284947aee8d/passB: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/681cbb7d12581e7c/passA: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/681cbb7d12581e7c/passB: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/2dad51d4353fe772/passA: unknown rule ID exclude:5
- `luna-medium.json`: luna-medium.json/2dad51d4353fe772/passB: unknown rule ID exclude:5


Abstentions count as errors. Each metric pools the original-order and
reverse-order passes. “Worst Tag” is the minimum balanced accuracy across the
eleven contracts. Elapsed time is agent-session wall time, not raw Responses API
latency.

This public-anchor pilot is a contract-comprehension screen, not unseen-corpus
accuracy or release certification. The collaboration runner does not expose
billable input, cached-input, output, or reasoning-token counts, so exact dollar
cost cannot be reconstructed from these runs. Current official synchronous
rates are $0.20 input / $1.20 output per million tokens for Luna and $2.00 /
$12.00 for Terra; Batch halves those rates. A production-like Batch qualification
must archive response usage before cost can enter the final selection rule.
