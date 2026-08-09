import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type Verdict = 'applicable' | 'not_applicable' | 'abstain';
type Pass = {
  verdict: Verdict;
  confidence: number;
  ruleIds: string[];
  evidenceSenseKeys: string[];
};
type Prediction = { caseId: string; passA: Pass; passB: Pass };
type RawResult = {
  schemaVersion: string;
  model: string;
  reasoningEffort: string;
  benchmarkHash: string;
  startedAtUtc: string;
  completedAtUtc: string;
  predictions: Prediction[];
};
type BenchmarkCase = {
  caseId: string;
  contractSlug: string;
  entry: { senses: Array<{ key: string }> };
};

const directory = fileURLToPath(new URL('.', import.meta.url));
const input = JSON.parse(await readFile(`${directory}/input.json`, 'utf8')) as {
  benchmarkHash: string;
  contracts: Array<{ slug: string; inclusionRules: string[]; exclusionRules: string[] }>;
  cases: BenchmarkCase[];
};
const expected = JSON.parse(await readFile(`${directory}/expected.json`, 'utf8')) as {
  benchmarkHash: string;
  cases: Array<{ caseId: string; label: Exclude<Verdict, 'abstain'> }>;
};
const expectedById = new Map(expected.cases.map((item) => [item.caseId, item.label]));
const caseById = new Map(input.cases.map((item) => [item.caseId, item]));
const contractBySlug = new Map(input.contracts.map((contract) => [contract.slug, contract]));

if (input.benchmarkHash !== expected.benchmarkHash) throw new Error('input and expected benchmark hashes differ');

const rawDirectory = `${directory}/raw`;
const rawFiles = (await readdir(rawDirectory)).filter((name) => name.endsWith('.json')).sort();
if (rawFiles.length === 0) throw new Error('no raw results found');

const isVerdict = (value: unknown): value is Verdict =>
  value === 'applicable' || value === 'not_applicable' || value === 'abstain';

function validatePass(pass: Pass, benchmarkCase: BenchmarkCase, location: string): string[] {
  const errors: string[] = [];
  if (!isVerdict(pass.verdict)) errors.push(`${location}: invalid verdict`);
  if (!Number.isInteger(pass.confidence) || pass.confidence < 0 || pass.confidence > 100) {
    errors.push(`${location}: invalid confidence`);
  }
  if (!Array.isArray(pass.ruleIds) || !pass.ruleIds.every((rule) => /^(include|exclude):[1-9]\d*$/.test(rule) || rule === 'global:substantive-topic')) {
    errors.push(`${location}: invalid ruleIds`);
  }
  const contract = contractBySlug.get(benchmarkCase.contractSlug);
  if (!contract) return [...errors, `${location}: unknown contract`];
  for (const rule of pass.ruleIds) {
    if (rule === 'global:substantive-topic') continue;
    const match = /^(include|exclude):(\d+)$/.exec(rule);
    if (!match) {
      errors.push(`${location}: invalid rule ID ${rule}`);
      continue;
    }
    const rules = match[1] === 'include' ? contract.inclusionRules : contract.exclusionRules;
    if (Number(match[2]) > rules.length) errors.push(`${location}: unknown rule ID ${rule}`);
  }
  const validSenses = new Set(benchmarkCase.entry.senses.map((sense) => sense.key));
  if (!Array.isArray(pass.evidenceSenseKeys) || !pass.evidenceSenseKeys.every((key) => validSenses.has(key))) {
    errors.push(`${location}: invalid evidenceSenseKeys`);
  }
  return errors;
}

function f1(tp: number, fp: number, fn: number): number {
  const denominator = 2 * tp + fp + fn;
  return denominator === 0 ? 0 : (2 * tp) / denominator;
}

function metricsFor(predictions: Prediction[], caseIds: string[]) {
  let correct = 0;
  let abstentions = 0;
  let applicableTp = 0;
  let applicableFp = 0;
  let applicableFn = 0;
  let negativeTp = 0;
  let negativeFp = 0;
  let negativeFn = 0;

  for (const caseId of caseIds) {
    const prediction = predictions.find((item) => item.caseId === caseId);
    if (!prediction) throw new Error(`missing prediction for ${caseId}`);
    for (const pass of [prediction.passA, prediction.passB]) {
      const label = expectedById.get(caseId);
      if (!label) throw new Error(`missing expected label for ${caseId}`);
      if (pass.verdict === label) correct += 1;
      if (pass.verdict === 'abstain') abstentions += 1;

      if (label === 'applicable') {
        if (pass.verdict === 'applicable') applicableTp += 1;
        else applicableFn += 1;
        if (pass.verdict === 'not_applicable') negativeFp += 1;
      } else {
        if (pass.verdict === 'not_applicable') negativeTp += 1;
        else negativeFn += 1;
        if (pass.verdict === 'applicable') applicableFp += 1;
      }
    }
  }

  const total = caseIds.length * 2;
  const applicableRecall = applicableTp / (applicableTp + applicableFn);
  const negativeRecall = negativeTp / (negativeTp + negativeFn);
  return {
    accuracy: correct / total,
    balancedAccuracy: (applicableRecall + negativeRecall) / 2,
    macroF1:
      (f1(applicableTp, applicableFp, applicableFn) + f1(negativeTp, negativeFp, negativeFn)) / 2,
    abstentionRate: abstentions / total,
  };
}

const results = [];
for (const file of rawFiles) {
  const raw = JSON.parse(await readFile(`${rawDirectory}/${file}`, 'utf8')) as RawResult;
  const validationErrors: string[] = [];
  if (raw.schemaVersion !== 'synac-served-model-result-v2') throw new Error(`${file}: invalid schemaVersion`);
  if (raw.benchmarkHash !== input.benchmarkHash) throw new Error(`${file}: benchmark hash mismatch`);
  if (!Array.isArray(raw.predictions) || raw.predictions.length !== input.cases.length) {
    throw new Error(`${file}: expected ${input.cases.length} predictions`);
  }
  const ids = raw.predictions.map((prediction) => prediction.caseId);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== input.cases[index].caseId)) {
    throw new Error(`${file}: predictions must contain every case once in input order`);
  }
  for (const prediction of raw.predictions) {
    const benchmarkCase = caseById.get(prediction.caseId);
    if (!benchmarkCase) throw new Error(`${file}: unknown case ${prediction.caseId}`);
    validationErrors.push(...validatePass(prediction.passA, benchmarkCase, `${file}/${prediction.caseId}/passA`));
    validationErrors.push(...validatePass(prediction.passB, benchmarkCase, `${file}/${prediction.caseId}/passB`));
  }

  const overall = metricsFor(raw.predictions, ids);
  const tags = [...new Set(input.cases.map((item) => item.contractSlug))].sort();
  const perTag = Object.fromEntries(
    tags.map((tag) => {
      const tagIds = input.cases.filter((item) => item.contractSlug === tag).map((item) => item.caseId);
      return [tag, metricsFor(raw.predictions, tagIds)];
    }),
  );
  const passACorrect = raw.predictions.filter(
    (prediction) => prediction.passA.verdict === expectedById.get(prediction.caseId),
  ).length;
  const passBCorrect = raw.predictions.filter(
    (prediction) => prediction.passB.verdict === expectedById.get(prediction.caseId),
  ).length;
  const flips = raw.predictions.filter((prediction) => prediction.passA.verdict !== prediction.passB.verdict).length;
  const started = Date.parse(raw.startedAtUtc);
  const completed = Date.parse(raw.completedAtUtc);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    throw new Error(`${file}: invalid timestamps`);
  }

  results.push({
    file,
    model: raw.model,
    reasoningEffort: raw.reasoningEffort,
    schemaValid: validationErrors.length === 0,
    validationErrors,
    cases: raw.predictions.length,
    elapsedSeconds: (completed - started) / 1_000,
    passAAccuracy: passACorrect / raw.predictions.length,
    passBAccuracy: passBCorrect / raw.predictions.length,
    ...overall,
    mirrorFlipRate: flips / raw.predictions.length,
    minimumTagBalancedAccuracy: Math.min(...Object.values(perTag).map((tag) => tag.balancedAccuracy)),
    perTag,
  });
}

results.sort(
  (a, b) =>
    Number(b.schemaValid) - Number(a.schemaValid) ||
    b.balancedAccuracy - a.balancedAccuracy ||
    b.macroF1 - a.macroF1 ||
    b.minimumTagBalancedAccuracy - a.minimumTagBalancedAccuracy ||
    a.abstentionRate - b.abstentionRate ||
    a.mirrorFlipRate - b.mirrorFlipRate ||
    a.elapsedSeconds - b.elapsedSeconds,
);

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const rows = results.map(
  (result, index) =>
    `| ${index + 1} | ${result.model} | ${result.reasoningEffort} | ${result.schemaValid ? 'PASS' : 'FAIL'} | ${percent(result.balancedAccuracy)} | ${percent(result.macroF1)} | ${percent(result.minimumTagBalancedAccuracy)} | ${percent(result.abstentionRate)} | ${percent(result.mirrorFlipRate)} | ${result.elapsedSeconds.toFixed(1)}s |`,
);
const validationFailures = results
  .filter((result) => !result.schemaValid)
  .flatMap((result) => result.validationErrors.map((error) => `- \`${result.file}\`: ${error}`));
const markdown = `# Served-model public-anchor results

Benchmark hash: \`${input.benchmarkHash}\`

| Rank | Model | Effort | Schema | Balanced accuracy | Macro-F1 | Worst Tag | Abstain | Mirror flips | Elapsed |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

${validationFailures.length > 0 ? `## Validation failures\n\n${validationFailures.join('\n')}\n` : ''}

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

- Luna \`high\`: economical family candidate and best valid aggregate screen;
- Terra \`low\`: cheapest Terra effort and near-ceiling screen; and
- Terra \`xhigh\`: Terra quality ceiling for the hard/disagreement stratum.

Luna \`low\` and \`medium\` do not advance. Luna \`xhigh\`/\`max\` add no screen quality
over \`high\`; Terra \`medium\`/\`high\`/\`max\` add no screen quality over the retained
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
`;

await writeFile(`${directory}/results.json`, `${JSON.stringify({ benchmarkHash: input.benchmarkHash, results }, null, 2)}\n`);
await writeFile(`${directory}/results.md`, markdown);
console.log(JSON.stringify(results.map(({ perTag: _perTag, ...result }) => result), null, 2));
