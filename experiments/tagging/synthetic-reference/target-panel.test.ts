import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { hashCanonical, sha256 } from './canonical.ts';
import type { OllamaRequest, QualificationReport } from './local-panel.ts';
import { parseOllamaImmutableModelId } from './ollama-model.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import {
  aggregateTargetDraft,
  buildTargetAuditPlan,
  buildTargetOllamaRequest,
  claimTargetReleaseDirectory,
  computeTargetIntegrityReport,
  compareTargetJobs,
  deriveTargetJob,
  executeTargetPhase,
  finalizeTargetAdjudication,
  parseTargetCli,
  prepareTarget,
  type FinalAdjudication,
  type TargetJob,
  type TargetPlan,
  type TargetTerminalResult,
  validateTargetResponse,
  validateTargetPlan,
} from './target-panel.ts';
import type {
  ClassificationEntry,
  CorpusSnapshot,
  ModelLineages,
  RuntimeConfig,
  TagId,
} from './types.ts';
import { TAG_IDS } from './types.ts';

const SHA = sha256('target-test');

test('target CLI accepts pnpm literal argument separator', () => {
  const parsed = parseTargetCli([
    '--',
    'prepare',
    '--artifacts',
    'C:\\external\\synac-run-001',
    '--qualification-report',
    'C:\\external\\synac-panel-001\\qualification-report.json',
    '--models',
    'C:\\external\\models.json',
    '--runtime',
    'C:\\external\\runtime.json',
    '--state',
    'C:\\external\\synac-target-001',
    '--endpoint',
    'http://127.0.0.1:11434',
    '--context',
    '8192',
  ]);
  assert.equal(parsed.command, 'prepare');
  assert.equal(parsed.flags.get('--state'), 'C:\\external\\synac-target-001');
  assert.equal(parsed.flags.get('--context'), '8192');
});

test('target execution order groups phase, lane/model, mirror, then job ID', () => {
  const plan = planFor([entry(1)]);
  const ordered = [...plan.jobs].sort(compareTargetJobs);
  assert.deepEqual(
    ordered.map((job) => `${job.phase}/${job.lane}/${job.mirror}`),
    [
      'primary/P1/M1',
      'primary/P1/M2',
      'primary/P2/M1',
      'primary/P2/M2',
      'primary/P3/M1',
      'primary/P3/M2',
      'primary/P4/M1',
      'primary/P4/M2',
      'critic/C+/S1',
      'critic/C-/S1',
    ],
  );
});

function entry(index: number): ClassificationEntry {
  return {
    key: `TERM:target-${index}`,
    entryType: 'TERM',
    slug: `target-${index}`,
    title: `Target ${index}`,
    aliases: [],
    summaryText: null,
    senses: [
      {
        key: `sense-${index}`,
        order: 0,
        label: null,
        expandedForm: null,
        definitionText: `Exact target definition ${index}.`,
        examples: [],
        sourceSlugs: ['fixture'],
      },
    ],
  };
}

function qualification(planHash = SHA): QualificationReport {
  const mapping = [
    { x: 0.2, y: 0 },
    { x: 1, y: 1 },
  ];
  const calibrators: Record<
    TagId,
    readonly Readonly<{ x: number; y: number }>[]
  > = {
    T01: mapping,
    T02: mapping,
    T03: mapping,
    T04: mapping,
    T05: mapping,
    T06: mapping,
    T07: mapping,
    T08: mapping,
    T09: mapping,
    T10: mapping,
    T11: mapping,
  };
  const balanced: Record<TagId, number> = {
    T01: 1,
    T02: 1,
    T03: 1,
    T04: 1,
    T05: 1,
    T06: 1,
    T07: 1,
    T08: 1,
    T09: 1,
    T10: 1,
    T11: 1,
  };
  const lanes = (['P1', 'P2', 'P3', 'P4', 'A1', 'A2'] as const).map((lane) => ({
    lane,
    macroF1: 1,
    balancedAccuracyByTag: balanced,
    minimumBalancedAccuracy: 1,
    ece: 0,
    brier: 0,
    mirrorAgreementOverall: 1,
    mirrorAgreementByTag: balanced,
    injectionSuccesses: 0,
    invalidOrMissingJobs: 0,
    timing: {
      calls: 0,
      elapsedMs: 0,
      totalDurationNs: 0,
      promptTokens: 0,
      completionTokens: 0,
    },
    calibrators,
    pass: true,
    failures: [],
  }));
  const core = {
    schemaVersion: 'synac-local-qualification-report-v2' as const,
    planHash,
    controlCounts: [],
    lanes,
    primaryErrorPhi: [],
    meanPrimaryErrorPhi: 0,
    maximumPrimaryErrorPhi: 0,
    pass: true,
    failures: [],
  };
  return { ...core, reportHash: hashCanonical(core) };
}

function planFor(
  values: readonly ClassificationEntry[],
  sameFamily = false,
): TargetPlan {
  const entries = values.map((value) => ({
    entryKey: value.key,
    entryHash: hashCanonical(value),
    conceptFamilyId: sameFamily ? SHA : sha256(`family-${value.key}`),
    split: 'development' as const,
  }));
  const identity = {
    manifestHash: SHA,
    masterSeed: SHA,
    rendererHashes: { R1: sha256('R1'), R2: sha256('R2') },
  };
  const jobs = entries.flatMap((value) => [
    ...(['P1', 'P2', 'P3', 'P4'] as const).flatMap((lane) =>
      (['M1', 'M2'] as const).map((mirror) =>
        deriveTargetJob(identity, value, 'primary', lane, mirror, TAG_IDS),
      ),
    ),
    deriveTargetJob(identity, value, 'critic', 'C+', 'S1', TAG_IDS),
    deriveTargetJob(identity, value, 'critic', 'C-', 'S1', TAG_IDS),
  ]);
  const core = {
    schemaVersion: 'synac-target-plan-v1' as const,
    artifactDirectory: 'C:\\external\\artifacts',
    modelsPath: 'C:\\external\\models.json',
    runtimePath: 'C:\\external\\runtime.json',
    qualificationReportPath: 'C:\\external\\qualification.json',
    stateDirectory: 'C:\\external\\state',
    endpoint: 'http://127.0.0.1:11434',
    contextWindow: 8192,
    manifestHash: SHA,
    corpusHash: SHA,
    rubricHash: hashCanonical(FROZEN_RUBRIC),
    splitHash: SHA,
    modelHash: SHA,
    runtimeHash: SHA,
    qualificationReportHash: qualification().reportHash,
    masterSeed: SHA,
    rendererHashes: identity.rendererHashes,
    entries,
    jobs,
  };
  return { ...core, planHash: hashCanonical(core) };
}

function terminal(
  plan: TargetPlan,
  job: TargetJob,
  verdict: 'yes' | 'no',
  decisive = false,
): TargetTerminalResult {
  const decisions = job.targetTagIds.map((tagId) => ({
    tag_id: tagId,
    verdict,
    p_applicable: verdict === 'yes' ? 95 : 5,
    decisive,
    rule_ids: [],
    evidence: [],
    counterevidence: '',
  }));
  return {
    schemaVersion: 'synac-target-result-v1',
    planHash: plan.planHash,
    jobId: job.jobId,
    requestId: job.requestId,
    lane: job.lane,
    phase: job.phase,
    status: 'valid',
    reason: null,
    attempt: 1,
    callCount: 1,
    response: {
      request_id: job.requestId,
      entry_hash: job.entryHash,
      rubric_hash: plan.rubricHash,
      seal_id: job.sealId,
      renderer_hash: job.rendererHash,
      injection_suspected: false,
      decisions,
    },
    rawResponseHash: SHA,
    elapsedMs: 1,
    promptTokens: 1,
    completionTokens: 1,
  };
}

function initialResults(plan: TargetPlan): readonly TargetTerminalResult[] {
  return plan.jobs.map((job) =>
    terminal(plan, job, job.lane === 'C-' ? 'no' : 'yes'),
  );
}

function corpus(values: readonly ClassificationEntry[]): CorpusSnapshot {
  const entries = values.map((value) => ({
    entry: value,
    entryHash: hashCanonical(value),
  }));
  const core = {
    schemaVersion: 'synac-classification-corpus-v1' as const,
    contentVersion: 'fixture',
    entries,
  };
  return { ...core, corpusHash: hashCanonical(core) };
}

function models(): ModelLineages {
  return {
    schemaVersion: 'synac-model-lineages-v1',
    lanes: (['P1', 'P2', 'P3', 'P4', 'A1', 'A2', 'C+', 'C-'] as const).map(
      (lane, index) => ({
        lane,
        trainingOrganization: `org-${index}`,
        baseModelFamily: `family-${index}`,
        ancestry: `ancestry-${index}`,
        provider: 'ollama',
        immutableModelId: `ollama:model-${index}:latest@${(index + 1).toString(16).padStart(12, '0')}`,
        backendFingerprint: `backend-${index}`,
        openWeights: true,
        weightsHash: SHA,
      }),
    ),
  };
}

const runtime: RuntimeConfig = {
  schemaVersion: 'synac-runtime-config-v1',
  runId: 'fixture',
  frozenAt: '2026-01-01T00:00:00.000Z',
  temperature: 0,
  seed: 7,
  tokenLimit: 2048,
  tools: false,
  candidates: 1,
};

const targetModelCatalogTransport = async (): Promise<{
  status: number;
  body: unknown;
}> => ({
  status: 200,
  body: {
    models: models().lanes.map((lane) => {
      const parsed = parseOllamaImmutableModelId(lane.immutableModelId);
      return {
        name: parsed.actualTag,
        digest: `${parsed.pinnedDigest}${'0'.repeat(52)}`,
      };
    }),
  },
});

test('3-of-4 mirror consensus accepts; instability triggers fixed double-pass arbitration', () => {
  const plan = planFor([entry(1)]);
  const stable = aggregateTargetDraft(
    plan,
    qualification(),
    initialResults(plan),
  );
  assert.equal(
    stable.cells.every((cell) => cell.status === 'accepted'),
    true,
  );
  assert.equal(stable.arbitrationJobs.length, 0);

  const changed = initialResults(plan).map((result) => {
    const job = plan.jobs.find((candidate) => candidate.jobId === result.jobId);
    return job?.lane === 'P4' && job.mirror === 'M2'
      ? terminal(plan, job, 'no')
      : result;
  });
  const draft = aggregateTargetDraft(plan, qualification(), changed);
  assert.equal(draft.arbitrationJobs.length, 4);
  assert.deepEqual(
    draft.arbitrationJobs
      .map((job) => `${job.lane}/${job.mirror}:${job.argumentOrder.join(',')}`)
      .sort(),
    [
      'A1/M1:include,exclude',
      'A1/M2:exclude,include',
      'A2/M1:exclude,include',
      'A2/M2:include,exclude',
    ],
  );
  const finalized = finalizeTargetAdjudication(
    plan,
    draft,
    qualification(),
    draft.arbitrationJobs.map((job) => terminal(plan, job, 'yes')),
  );
  assert.equal(
    finalized.cells.every((cell) => cell.status === 'accepted'),
    true,
  );
  assert.equal(
    finalized.cells.every((cell) => cell.arbitrated),
    true,
  );
});

test('audit selection keeps concept families atomic and R2 blind', () => {
  const values = [entry(1), entry(2)];
  const plan = planFor(values, true);
  const draft = aggregateTargetDraft(
    plan,
    qualification(),
    initialResults(plan),
  );
  const cells = draft.cells.map((cell, index) => ({
    ...cell,
    arbitrated: index === 0,
  }));
  const core = {
    schemaVersion: 'synac-target-adjudication-v1' as const,
    planHash: plan.planHash,
    cells,
  };
  const adjudication: FinalAdjudication = {
    ...core,
    adjudicationHash: hashCanonical(core),
  };
  const audit = buildTargetAuditPlan(plan, adjudication);
  assert.deepEqual(
    [...audit.selectedEntryKeys].sort(),
    values.map((value) => value.key).sort(),
  );
  assert.equal(
    audit.jobs.every((job) => job.renderer === 'R2'),
    true,
  );
  assert.equal(
    audit.jobs.every((job) => job.argumentOrder.length === 0),
    true,
  );

  const context = {
    plan,
    corpus: corpus(values),
    rubric: FROZEN_RUBRIC,
    models: models(),
    runtime,
    qualification: qualification(),
  };
  const verifier = audit.jobs[0];
  assert.ok(verifier);
  assert.throws(
    () =>
      buildTargetOllamaRequest(context, verifier, [
        {
          proposalId: SHA,
          mirror: 'S1',
          stance: 'neutral',
          decisions: [],
        },
      ]),
    /blind verification/,
  );
  const request = buildTargetOllamaRequest(context, verifier);
  assert.equal(
    request.model,
    verifier.lane === 'V1' ? 'model-4:latest' : 'model-5:latest',
  );
  assert.match(
    request.messages[0]?.content ?? '',
    /Every yes verdict must include at least one exact nonempty quote/,
  );
  const format = request.format as {
    properties: {
      request_id: { const: string };
      entry_hash: { const: string };
      rubric_hash: { const: string };
      seal_id: { const: string };
      renderer_hash: { const: string };
      decisions: {
        items: Array<{
          oneOf: Array<{
            properties: {
              tag_id: { const: TagId };
              verdict: { const: string };
              rule_ids: { items: { enum: string[] } };
              evidence: {
                minItems?: number;
                items: {
                  oneOf: Array<{
                    properties: {
                      sense_key: { const: string };
                      field: { const: string };
                      example_index: { const: number | null };
                    };
                  }>;
                };
              };
            };
          }>;
        }>;
      };
    };
  };
  assert.equal(format.properties.request_id.const, verifier.requestId);
  assert.equal(format.properties.entry_hash.const, verifier.entryHash);
  assert.equal(format.properties.rubric_hash.const, plan.rubricHash);
  assert.equal(format.properties.seal_id.const, verifier.sealId);
  assert.equal(format.properties.renderer_hash.const, verifier.rendererHash);
  const firstSlot = format.properties.decisions.items[0];
  assert.ok(firstSlot);
  assert.equal(firstSlot.oneOf[0]?.properties.verdict.const, 'yes');
  assert.equal(firstSlot.oneOf[0]?.properties.evidence.minItems, 1);
  assert.equal(firstSlot.oneOf[1]?.properties.verdict.const, 'no');
  assert.equal(firstSlot.oneOf[2]?.properties.verdict.const, 'abstain');
  assert.equal(firstSlot.oneOf[1]?.properties.evidence.minItems, undefined);
  assert.deepEqual(
    format.properties.decisions.items.map(
      (slot) => slot.oneOf[0]?.properties.tag_id.const,
    ),
    verifier.tagOrder.filter((tagId) => verifier.targetTagIds.includes(tagId)),
  );
  assert.deepEqual(
    firstSlot.oneOf[0]?.properties.evidence.items.oneOf.map((variant) => [
      variant.properties.field.const,
      variant.properties.example_index.const,
    ]),
    [['definition', null]],
  );
  assert.doesNotMatch(
    request.messages[1]?.content ?? '',
    /accepted|expected|adjudication|"split"/i,
  );
});

test('target source-shaped grammar rejects nonexistent label and accepts real label/example evidence', () => {
  const base = entry(2);
  const sense = base.senses[0];
  assert.ok(sense);
  const value: ClassificationEntry = {
    ...base,
    senses: [
      {
        ...sense,
        label: 'Target fixture label',
        expandedForm: 'Target Fixture Expanded',
        examples: ['Target fixture example.'],
      },
    ],
  };
  const plan = planFor([value]);
  const job = plan.jobs[0];
  assert.ok(job);
  const context = {
    plan,
    corpus: corpus([value]),
    rubric: FROZEN_RUBRIC,
    models: models(),
    runtime,
    qualification: qualification(),
  };
  const request = buildTargetOllamaRequest(context, job);
  const format = request.format as {
    properties: {
      decisions: {
        items: Array<{
          oneOf: Array<{
            properties: {
              evidence: {
                items: {
                  oneOf: Array<{
                    properties: {
                      field: { const: string };
                      example_index: { const: number | null };
                    };
                  }>;
                };
              };
            };
          }>;
        }>;
      };
    };
  };
  const variants =
    format.properties.decisions.items[0]?.oneOf[0]?.properties.evidence.items
      .oneOf ?? [];
  assert.deepEqual(
    variants.map((variant) => [
      variant.properties.field.const,
      variant.properties.example_index.const,
    ]),
    [
      ['definition', null],
      ['label', null],
      ['expanded_form', null],
      ['example', 0],
    ],
  );
  const reverseJob = plan.jobs.find(
    (candidate) => candidate.lane === 'P1' && candidate.mirror === 'M2',
  );
  assert.ok(reverseJob);
  const reverseFormat = buildTargetOllamaRequest(context, reverseJob)
    .format as {
    properties: {
      decisions: {
        items: Array<{
          oneOf: Array<{ properties: { tag_id: { const: TagId } } }>;
        }>;
      };
    };
  };
  assert.deepEqual(
    reverseFormat.properties.decisions.items.map(
      (slot) => slot.oneOf[0]?.properties.tag_id.const,
    ),
    reverseJob.tagOrder,
  );
  const outer = validMockBody(request) as {
    message: { content: string };
  };
  const response = JSON.parse(outer.message.content) as {
    request_id: string;
    decisions: Array<{
      tag_id: TagId;
      rule_ids: string[];
      evidence: Array<{
        sense_key: string;
        field: string;
        example_index: number | null;
        quote: string;
      }>;
    }>;
  };
  const first = response.decisions[0];
  assert.ok(first);
  first.evidence = [
    {
      sense_key: sense.key,
      field: 'definition',
      example_index: null,
      quote: sense.definitionText,
    },
    {
      sense_key: sense.key,
      field: 'label',
      example_index: null,
      quote: 'Target fixture label',
    },
    {
      sense_key: sense.key,
      field: 'example',
      example_index: 0,
      quote: 'Target fixture example.',
    },
  ];
  assert.doesNotThrow(() =>
    validateTargetResponse(response, plan, job, context.corpus, FROZEN_RUBRIC),
  );
  const originalRequestId = response.request_id;
  response.request_id = sha256('foreign-target-request');
  assert.throws(
    () =>
      validateTargetResponse(
        response,
        plan,
        job,
        context.corpus,
        FROZEN_RUBRIC,
      ),
    /identity\/schema mismatch/,
  );
  response.request_id = originalRequestId;
  const second = response.decisions[1];
  assert.ok(second);
  const originalRuleIds = second.rule_ids;
  const foreignTag = FROZEN_RUBRIC.tags.find((tag) => tag.id !== second.tag_id);
  assert.ok(foreignTag);
  second.rule_ids = [foreignTag.inclusionRules[0].id];
  assert.throws(
    () =>
      validateTargetResponse(
        response,
        plan,
        job,
        context.corpus,
        FROZEN_RUBRIC,
      ),
    /foreign\/polarity rule/,
  );
  second.rule_ids = originalRuleIds;
  [response.decisions[0], response.decisions[1]] = [
    response.decisions[1]!,
    response.decisions[0]!,
  ];
  assert.throws(
    () =>
      validateTargetResponse(
        response,
        plan,
        job,
        context.corpus,
        FROZEN_RUBRIC,
      ),
    /ordered tag mismatch/,
  );
  [response.decisions[0], response.decisions[1]] = [
    response.decisions[1]!,
    response.decisions[0]!,
  ];
  assert.doesNotThrow(() =>
    validateTargetResponse(response, plan, job, context.corpus, FROZEN_RUBRIC),
  );
  first.evidence = [
    {
      sense_key: sense.key,
      field: 'label',
      example_index: null,
      quote: 'Target fixture label',
    },
  ];
  const nullLabelCorpus = corpus([base]);
  assert.throws(
    () =>
      validateTargetResponse(
        { ...response, entry_hash: hashCanonical(base) },
        { ...plan, corpusHash: nullLabelCorpus.corpusHash },
        { ...job, entryHash: hashCanonical(base), entryKey: base.key },
        nullLabelCorpus,
        FROZEN_RUBRIC,
      ),
    /invalid source tuple|exact live sense|label/i,
  );
});

test('integrity report quarantines undersampled strata and blocks release gates', () => {
  const value = entry(1);
  const plan = planFor([value]);
  const draft = aggregateTargetDraft(
    plan,
    qualification(),
    initialResults(plan),
  );
  const core = {
    schemaVersion: 'synac-target-adjudication-v1' as const,
    planHash: plan.planHash,
    cells: draft.cells,
  };
  const adjudication: FinalAdjudication = {
    ...core,
    adjudicationHash: hashCanonical(core),
  };
  const auditPlan = buildTargetAuditPlan(plan, adjudication);
  const report = computeTargetIntegrityReport({
    plan,
    adjudication,
    auditPlan,
    auditResults: auditPlan.jobs.map((job) => terminal(plan, job, 'yes')),
    qualification: qualification(),
  });
  assert.equal(report.pass, false);
  assert.equal(report.doubleCheckAgreementOverall, 1);
  assert.equal(report.quarantinedTagPolarities.includes('T01/positive'), true);
  assert.equal(
    report.failures.some((failure) => failure.includes('< 25')),
    true,
  );
});

test('release directory claim is external and one-use', async () => {
  const external = await mkdtemp(path.join(tmpdir(), 'synac-target-release-'));
  const output = path.join(external, 'release-v1');
  const repositoryRoot = path.resolve('.');
  assert.equal(
    await claimTargetReleaseDirectory(output, repositoryRoot),
    output,
  );
  await assert.rejects(
    claimTargetReleaseDirectory(output, repositoryRoot),
    /EEXIST|already exists/i,
  );
  await assert.rejects(
    claimTargetReleaseDirectory(
      path.join(repositoryRoot, 'forbidden-target-release'),
      repositoryRoot,
    ),
    /outside the repository/,
  );
});

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fullRunnerFixture(): Promise<
  Readonly<{
    repositoryRoot: string;
    stateDirectory: string;
    environment: NodeJS.ProcessEnv;
  }>
> {
  const repositoryRoot = path.resolve('.');
  const external = await mkdtemp(path.join(tmpdir(), 'synac-target-runner-'));
  const artifactDirectory = path.join(external, 'artifacts');
  const stateDirectory = path.join(external, 'state');
  const qualificationDirectory = path.join(external, 'qualification');
  const modelsPath = path.join(external, 'models.json');
  const runtimePath = path.join(external, 'runtime.json');
  await Promise.all([
    mkdir(artifactDirectory, { recursive: true }),
    mkdir(qualificationDirectory, { recursive: true }),
  ]);
  const values = Array.from({ length: 1500 }, (_, index) => entry(index + 100));
  const corpusSnapshot = corpus(values);
  const assignments = values.map((value, index) => ({
    familyId: sha256(`fixture-family-${index}`),
    entryKeys: [value.key],
    split:
      index < 800
        ? ('development' as const)
        : index < 1100
          ? ('calibration' as const)
          : index < 1400
            ? ('validation' as const)
            : ('audit' as const),
    forcedDevelopment: false,
  }));
  const splitCore = {
    schemaVersion: 'synac-family-split-v1' as const,
    selectionSeed: SHA,
    capacities: {
      development: 800,
      calibration: 300,
      validation: 300,
      audit: 100,
    },
    counts: { development: 800, calibration: 300, validation: 300, audit: 100 },
    assignments,
  };
  const split = { ...splitCore, splitHash: hashCanonical(splitCore) };
  const modelConfig = models();
  const modelHash = hashCanonical(modelConfig);
  const runtimeHash = hashCanonical(runtime);
  const rubricHash = hashCanonical(FROZEN_RUBRIC);
  const manifestCore = {
    schemaVersion: 'synac-reference-manifest-v1' as const,
    protocolVersion: 'synac-ai-adjudication-v1' as const,
    runId: 'target-runner-fixture',
    frozenAt: '2026-01-01T00:00:00.000Z',
    entryCount: 1500 as const,
    tagIds: TAG_IDS,
    hashes: {
      corpus: corpusSnapshot.corpusHash,
      rubric: rubricHash,
      split: split.splitHash,
      controls: SHA,
      injectionPackets: SHA,
      code: SHA,
      runtime: runtimeHash,
      models: modelHash,
    },
    masterSeed: SHA,
    controlsReady: true,
  };
  const manifest = {
    ...manifestCore,
    manifestHash: hashCanonical(manifestCore),
  };
  const bindings = {
    manifestHash: manifest.manifestHash,
    corpusHash: corpusSnapshot.corpusHash,
    rubricHash,
    controlHash: SHA,
    injectionHash: SHA,
    modelHash,
    runtimeHash,
  };
  const qualificationPlanCore = {
    schemaVersion: 'synac-local-qualification-plan-v2' as const,
    artifactDirectory,
    modelsPath,
    runtimePath,
    endpoint: 'http://127.0.0.1:11434',
    contextWindow: 8192,
    bindings,
    jobs: [],
  };
  const qualificationPlan = {
    ...qualificationPlanCore,
    planHash: hashCanonical(qualificationPlanCore),
  };
  await Promise.all([
    writeJson(path.join(artifactDirectory, 'manifest.json'), manifest),
    writeJson(path.join(artifactDirectory, 'corpus.json'), corpusSnapshot),
    writeJson(path.join(artifactDirectory, 'rubric.json'), FROZEN_RUBRIC),
    writeJson(path.join(artifactDirectory, 'split.json'), split),
    writeJson(modelsPath, modelConfig),
    writeJson(runtimePath, runtime),
    writeJson(
      path.join(qualificationDirectory, 'qualification-plan.json'),
      qualificationPlan,
    ),
    writeJson(
      path.join(qualificationDirectory, 'qualification-report.json'),
      qualification(qualificationPlan.planHash),
    ),
  ]);
  await prepareTarget({
    artifactDirectory,
    qualificationReportPath: path.join(
      qualificationDirectory,
      'qualification-report.json',
    ),
    modelsPath,
    runtimePath,
    stateDirectory,
    endpoint: 'http://127.0.0.1:11434',
    contextWindow: 8192,
    repositoryRoot,
  });
  const environment: NodeJS.ProcessEnv = {
    SYNAC_SEALED_STORE_DIR: path.join(external, 'sealed'),
    SYNAC_SEALED_KEY_PRIMARY: Buffer.alloc(32, 1).toString('base64'),
    SYNAC_SEALED_KEY_CRITIC: Buffer.alloc(32, 2).toString('base64'),
    SYNAC_SEALED_KEY_ARBITER: Buffer.alloc(32, 3).toString('base64'),
    SYNAC_SEALED_KEY_AUDITOR: Buffer.alloc(32, 4).toString('base64'),
  };
  return { repositoryRoot, stateDirectory, environment };
}

function validMockBody(
  request: OllamaRequest,
  observedEmptyAffirmative = false,
): unknown {
  const payload = JSON.parse(request.messages[1]?.content ?? '{}') as {
    immutableIdentity: {
      requestId: string;
      entryHash: string;
      rubricHash: string;
      sealId: string;
      rendererHash: string;
    };
    untrustedEntry: ClassificationEntry;
    frozenRubric: { tags: typeof FROZEN_RUBRIC.tags };
  };
  const sense = payload.untrustedEntry.senses[0];
  assert.ok(sense);
  const content = {
    request_id: payload.immutableIdentity.requestId,
    entry_hash: payload.immutableIdentity.entryHash,
    rubric_hash: payload.immutableIdentity.rubricHash,
    seal_id: payload.immutableIdentity.sealId,
    renderer_hash: payload.immutableIdentity.rendererHash,
    injection_suspected: false,
    decisions: payload.frozenRubric.tags.map((tag, index) => {
      const verdict = observedEmptyAffirmative && index > 0 ? 'no' : 'yes';
      return {
        tag_id: tag.id,
        verdict,
        p_applicable: verdict === 'yes' ? 95 : 5,
        decisive: false,
        rule_ids: [
          verdict === 'yes'
            ? tag.inclusionRules[0]?.id
            : tag.exclusionRules[0]?.id,
        ],
        evidence:
          verdict === 'yes' && !observedEmptyAffirmative
            ? [
                {
                  sense_key: sense.key,
                  field: 'definition',
                  example_index: null,
                  quote: sense.definitionText,
                },
              ]
            : [],
        counterevidence: '',
      };
    }),
  };
  return {
    model: request.model,
    created_at: '2026-01-01T00:00:00.000Z',
    message: { role: 'assistant', content: JSON.stringify(content) },
    prompt_eval_count: 10,
    eval_count: 10,
  };
}

test(
  'sealed target runner retries empty affirmative evidence, resumes without duplicate calls, and leaks no plaintext',
  { timeout: 30_000 },
  async () => {
    const fixture = await fullRunnerFixture();
    const mutatedPlan = JSON.parse(
      await readFile(
        path.join(fixture.stateDirectory, 'target-plan.json'),
        'utf8',
      ),
    ) as {
      contextWindow: number;
      entries: Array<{
        conceptFamilyId: string;
        split: 'development' | 'calibration' | 'validation' | 'audit';
      }>;
    };
    assert.throws(
      () => validateTargetPlan({ ...mutatedPlan, contextWindow: 32768 }),
      /8192 context required/,
    );
    const development = mutatedPlan.entries.find(
      (value) => value.split === 'development',
    );
    const calibration = mutatedPlan.entries.find(
      (value) => value.split === 'calibration',
    );
    assert.ok(development);
    assert.ok(calibration);
    calibration.conceptFamilyId = development.conceptFamilyId;
    assert.throws(() => validateTargetPlan(mutatedPlan), /family leakage/);

    let driftInferenceCalls = 0;
    await assert.rejects(
      executeTargetPhase(
        fixture.stateDirectory,
        'primary',
        async () => {
          driftInferenceCalls += 1;
          throw new Error('must not infer');
        },
        undefined,
        {
          repositoryRoot: fixture.repositoryRoot,
          environment: fixture.environment,
          modelCatalogTransport: async () => ({
            status: 200,
            body: {
              models: models().lanes.map((lane) => {
                const parsed = parseOllamaImmutableModelId(
                  lane.immutableModelId,
                );
                return {
                  name: parsed.actualTag,
                  digest: '0'.repeat(64),
                };
              }),
            },
          }),
        },
      ),
      /digest drift/,
    );
    assert.equal(driftInferenceCalls, 0);

    const requests: string[] = [];
    let calls = 0;
    const first = await executeTargetPhase(
      fixture.stateDirectory,
      'primary',
      async (_endpoint, request) => {
        calls += 1;
        requests.push(hashCanonical(request));
        return {
          status: 200,
          body:
            calls === 1 ? validMockBody(request, true) : validMockBody(request),
          elapsedMs: 1,
        };
      },
      2,
      {
        repositoryRoot: fixture.repositoryRoot,
        environment: fixture.environment,
        modelCatalogTransport: targetModelCatalogTransport,
      },
    );
    assert.deepEqual(first, { completed: 1, skipped: 0, abstained: 0 });
    assert.equal(calls, 2);
    assert.equal(requests[0], requests[1]);

    let resumedCalls = 0;
    let resumedRequestHash = '';
    await executeTargetPhase(
      fixture.stateDirectory,
      'primary',
      async (_endpoint, request) => {
        resumedCalls += 1;
        resumedRequestHash = hashCanonical(request);
        return {
          status: 200,
          body: {
            model: request.model,
            message: { role: 'assistant', content: '{malformed' },
          },
          elapsedMs: 1,
        };
      },
      1,
      {
        repositoryRoot: fixture.repositoryRoot,
        environment: fixture.environment,
        modelCatalogTransport: targetModelCatalogTransport,
      },
    );
    assert.equal(resumedCalls, 1);
    assert.notEqual(resumedRequestHash, requests[0]);

    const progressPath = path.join(
      fixture.stateDirectory,
      'target-primary-progress.ndjson',
    );
    const progressLines = (await readFile(progressPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const lastFinished = [...progressLines]
      .reverse()
      .find((line) => line.event === 'attempt_finished');
    assert.ok(lastFinished);
    await writeFile(
      progressPath,
      `${JSON.stringify({
        event: 'attempt_started',
        schemaVersion: 'synac-target-progress-pointer-v1',
        planHash: lastFinished.planHash,
        jobId: lastFinished.jobId,
        requestId: lastFinished.requestId,
        requestHash: lastFinished.requestHash,
        attempt: 2,
        startedAt: '2026-01-01T00:00:00.000Z',
      })}\n`,
      { encoding: 'utf8', flag: 'a' },
    );
    let interruptedCalls = 0;
    let postInterruptionRequestHash = '';
    const interrupted = await executeTargetPhase(
      fixture.stateDirectory,
      'primary',
      async (_endpoint, request) => {
        interruptedCalls += 1;
        postInterruptionRequestHash = hashCanonical(request);
        throw new Error('must not duplicate interrupted call');
      },
      1,
      {
        repositoryRoot: fixture.repositoryRoot,
        environment: fixture.environment,
        modelCatalogTransport: targetModelCatalogTransport,
      },
    );
    assert.equal(interruptedCalls, 1);
    assert.notEqual(postInterruptionRequestHash, lastFinished.requestHash);
    assert.equal(interrupted.completed, 1);
    assert.equal(interrupted.abstained, 1);

    const plaintext = [
      await readFile(
        path.join(fixture.stateDirectory, 'target-plan.json'),
        'utf8',
      ),
      await readFile(progressPath, 'utf8'),
      await readFile(
        path.join(fixture.stateDirectory, 'target-primary-results.ndjson'),
        'utf8',
      ),
    ].join('\n');
    assert.doesNotMatch(
      plaintext,
      /Exact target definition|p_applicable|counterevidence|rawContent|"verdict"|"messages"/,
    );
  },
);
