# Served-model public-anchor OpenAI Batch API results

Benchmark hash: `28ae4540e3c7e84564e1e4fd0c337d80105ebb13d6b34c569329c75ccf2c465b`

| Rank | Model | Effort | Contract | Balanced accuracy | Macro-F1 | Worst Tag | Abstain | Mirror flips | Elapsed | Input | Cached input | Output | Reasoning | Batch cost |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | gpt-5.6-terra | max | PASS | 97.7% | 97.7% | 90.0% | 0.0% | 0.9% | 511.0s | 74396 | 0 | 71929 | 60242 | $0.505970 |
| 2 | gpt-5.6-terra | xhigh | PASS | 96.8% | 96.8% | 85.0% | 0.0% | 0.9% | 511.0s | 74396 | 0 | 29285 | 17242 | $0.250106 |
| 3 | gpt-5.6-terra | low | PASS | 95.9% | 95.9% | 80.0% | 0.0% | 0.9% | 511.0s | 74396 | 0 | 14104 | 1536 | $0.159020 |
| 4 | gpt-5.6-luna | max | FAIL | 96.4% | 96.4% | 85.0% | 0.0% | 1.8% | 373.0s | 74396 | 0 | 102372 | 91366 | $0.068863 |
| 5 | gpt-5.6-luna | low | FAIL | 95.9% | 95.9% | 80.0% | 0.0% | 4.5% | 373.0s | 74396 | 0 | 11602 | 183 | $0.014401 |
| 6 | gpt-5.6-terra | high | FAIL | 95.5% | 95.4% | 80.0% | 0.0% | 1.8% | 511.0s | 74396 | 0 | 17862 | 6116 | $0.181568 |
| 7 | gpt-5.6-terra | medium | FAIL | 95.5% | 95.4% | 80.0% | 0.0% | 0.0% | 511.0s | 74396 | 0 | 15240 | 3055 | $0.165836 |
| 8 | gpt-5.6-luna | high | FAIL | 94.5% | 94.5% | 80.0% | 0.0% | 1.8% | 373.0s | 74396 | 0 | 23562 | 12603 | $0.021577 |
| 9 | gpt-5.6-luna | xhigh | FAIL | 94.5% | 94.5% | 80.0% | 0.0% | 1.8% | 373.0s | 74396 | 0 | 47270 | 35647 | $0.035802 |
| 10 | gpt-5.6-luna | medium | FAIL | 94.1% | 94.1% | 75.0% | 0.0% | 4.5% | 373.0s | 74396 | 0 | 16102 | 3405 | $0.017101 |

## Contract validation failures

- `luna-max.json`: luna-max.json/af6646e7182baa88/passB: unknown rule ID exclude:5
- `luna-max.json`: luna-max.json/dd4c5284947aee8d/passB: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/793d8fb657ac10a7/passB: unknown rule ID include:6
- `luna-low.json`: luna-low.json/72323594222f6184/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/af6646e7182baa88/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/af6646e7182baa88/passB: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/2af877c49183d750/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/dd4c5284947aee8d/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/dd4c5284947aee8d/passB: unknown rule ID exclude:6
- `luna-low.json`: luna-low.json/f2cc17cafc8dcae7/passB: unknown rule ID include:6
- `luna-low.json`: luna-low.json/c3c2cd462ba35765/passB: unknown rule ID exclude:7
- `luna-low.json`: luna-low.json/087ec89322ef0b27/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/681cbb7d12581e7c/passB: unknown rule ID exclude:7
- `luna-low.json`: luna-low.json/00cec21e8611d73f/passB: unknown rule ID exclude:4
- `luna-low.json`: luna-low.json/7f7187f58b68ec99/passB: unknown rule ID exclude:6
- `luna-low.json`: luna-low.json/d063f3b55e546d06/passA: unknown rule ID exclude:6
- `luna-low.json`: luna-low.json/d063f3b55e546d06/passB: unknown rule ID exclude:6
- `luna-low.json`: luna-low.json/60d5c58fe1406239/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/60d5c58fe1406239/passB: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/9c58663a01e53b84/passA: unknown rule ID include:6
- `luna-low.json`: luna-low.json/9c58663a01e53b84/passB: unknown rule ID include:6
- `luna-low.json`: luna-low.json/6c7f42e4c5659567/passB: unknown rule ID include:6
- `luna-low.json`: luna-low.json/cb9ca3a7b085ac48/passA: unknown rule ID include:6
- `luna-low.json`: luna-low.json/cb9ca3a7b085ac48/passB: unknown rule ID include:6
- `luna-low.json`: luna-low.json/2dad51d4353fe772/passA: unknown rule ID exclude:5
- `luna-low.json`: luna-low.json/799de5c76c650257/passB: unknown rule ID exclude:7
- `terra-high.json`: terra-high.json/681cbb7d12581e7c/passA: unknown rule ID exclude:5
- `terra-high.json`: terra-high.json/215bb0ed1a199018/passA: unknown rule ID exclude:6
- `terra-high.json`: terra-high.json/7f7187f58b68ec99/passA: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/ee3c6111b01b7d0e/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/f8660ad3bd8b0062/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/72323594222f6184/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/fbd50f6abb412c5a/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/af6646e7182baa88/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/2af877c49183d750/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/dd4c5284947aee8d/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/fa90ed2c1b676acc/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/24ea25d320f51857/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/af16d71fbd0b8391/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/0ef8b644adac2bfa/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/550a943aad0771bb/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/d6fc38f63dd3f2c9/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/c3c2cd462ba35765/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/561a7623ae518539/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/ec34df4a0dd3ed0b/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/67a547e392a81f86/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/3345b7ff6c849b6c/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/807c1dc13df208ef/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/087ec89322ef0b27/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/681cbb7d12581e7c/passA: unknown rule ID exclude:5
- `terra-medium.json`: terra-medium.json/681cbb7d12581e7c/passB: unknown rule ID exclude:10
- `terra-medium.json`: terra-medium.json/00cec21e8611d73f/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/215bb0ed1a199018/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/4c25e3dd3533efb5/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/de39e4a3a97ef3e3/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/7f7187f58b68ec99/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/d063f3b55e546d06/passB: unknown rule ID exclude:10
- `terra-medium.json`: terra-medium.json/99cd129bf47a8d6e/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/e253e71a95e4e435/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/c32f4f8817e0aba2/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/60d5c58fe1406239/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/0dcd0c896119e8cd/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/c353d0588d5ac9bf/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/784cd2613713f2a3/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/6abf48a1da72eec7/passB: unknown rule ID exclude:9
- `terra-medium.json`: terra-medium.json/1a5d4800f79d1b63/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/cb53007cf3f0e6fc/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/f2616249b3519460/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/e13396b0609ef6b5/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/76d2ae86da26a622/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/49e8e10ea072b88b/passB: unknown rule ID exclude:7
- `terra-medium.json`: terra-medium.json/40a00bae923aa426/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/c613af7b9caf3f5c/passB: unknown rule ID exclude:8
- `terra-medium.json`: terra-medium.json/03ede5cd1267da57/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/2290b413ae110649/passB: unknown rule ID exclude:6
- `terra-medium.json`: terra-medium.json/2dad51d4353fe772/passB: unknown rule ID exclude:10
- `terra-medium.json`: terra-medium.json/799de5c76c650257/passB: unknown rule ID exclude:8
- `luna-high.json`: luna-high.json/7f7187f58b68ec99/passB: unknown rule ID exclude:6
- `luna-high.json`: luna-high.json/2dad51d4353fe772/passB: unknown rule ID exclude:5
- `luna-xhigh.json`: luna-xhigh.json/b3c6586c33ce2526/passB: unknown rule ID exclude:4
- `luna-medium.json`: luna-medium.json/7f7187f58b68ec99/passA: unknown rule ID exclude:6
- `luna-medium.json`: luna-medium.json/7f7187f58b68ec99/passB: unknown rule ID exclude:6
- `luna-medium.json`: luna-medium.json/2dad51d4353fe772/passB: unknown rule ID exclude:5


Abstentions count as errors. Each metric pools the original-order and
reverse-order passes. “Worst Tag” is the minimum balanced accuracy across the
eleven contracts. Elapsed time is whole-Batch wall time shared by every configuration.

“Contract” includes semantic rule-index and evidence-key validation in addition
to the JSON shape. All collected OpenAI Batch responses satisfied the requested strict JSON
schema; a Contract failure means an ancillary provenance citation was invalid,
not that the verdict was missing or malformed.

## Decision

This is a uniform raw OpenAI Batch API run over the public
contract anchors. It measures structured-output validity, anchor classification,
mirror-order stability, API token use, and Batch cost. It remains ineligible for
release certification because the anchors and their balanced labels are public.

Advance Terra `max`, Terra `xhigh`, and Luna `max` to the
fresh sealed comparison. Terra `max` is the measured accuracy ceiling; Terra
`xhigh` is within one absolute percentage point at roughly half the measured
cost; Luna `max` is the economic challenger but requires a deliberately
verdict-only contract or a fresh generation that fixes its two invalid rule
citations. Retain Terra `low` only as the fully contract-valid served floor if
budget permits.

Every candidate produced zero abstentions and the remaining verdict errors
cluster on hard negatives. No direct-LLM configuration is eligible for AUTO
from this public fixture. The next comparison must use fresh sealed synthetic
reference cases, per-Tag calibration, selective abstention, exact usage, and
the independent local encoder/head controls.

This public-anchor pilot is a contract-comprehension screen, not unseen-corpus
accuracy or release certification. This run recorded $1.420243 in Batch charges. Current
official synchronous rates are $0.20 input / $1.20 output per million tokens
for Luna and $2.00 / $12.00 for Terra; Batch halves those rates.
