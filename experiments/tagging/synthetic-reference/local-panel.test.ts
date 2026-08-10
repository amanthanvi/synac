import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson, hashCanonical, sha256 } from './canonical.ts';
import {
  assertQualificationBindings,
  buildOllamaRequest,
  compareQualificationJobs,
  computeQualificationReport,
  executeQualificationJobs,
  parseQualificationCli,
  readQualificationResults,
  type OllamaRequest,
  type OllamaTransport,
  type QualificationJob,
  type QualificationPlan,
  type QualificationResult,
  type QualificationStorageOptions,
  validateQualificationPlan,
} from './local-panel.ts';
import { parseOllamaImmutableModelId } from './ollama-model.ts';
import { openSealedStoreRole, sealedStoreConfig } from './sealed-store.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import type {
  ClassificationEntry,
  ControlRecord,
  ControlSuite,
  CorpusSnapshot,
  InjectionSuite,
  ModelLineages,
  RuntimeConfig,
  TagId,
} from './types.ts';
import { TAG_IDS } from './types.ts';

type TestContext = Parameters<typeof executeQualificationJobs>[0];

test('qualification CLI accepts pnpm literal argument separator', () => {
  const parsed = parseQualificationCli([
    '--',
    'qualify',
    'prepare',
    '--artifacts',
    'C:\\external\\synac-run-001',
    '--models',
    'C:\\external\\models.json',
    '--runtime',
    'C:\\external\\runtime.json',
    '--state',
    'C:\\external\\synac-panel-001',
    '--endpoint',
    'http://127.0.0.1:11434',
    '--context',
    '8192',
  ]);
  assert.equal(parsed.mode, 'qualify');
  assert.equal(parsed.action, 'prepare');
  assert.equal(parsed.args.get('artifacts'), 'C:\\external\\synac-run-001');
  assert.equal(parsed.args.get('context'), '8192');
  const drifted = {
    ...context('C:\\external\\state').plan,
    contextWindow: 32768,
  };
  assert.throws(
    () => validateQualificationPlan(drifted),
    /contextWindow must be 8192/,
  );
});

const bindings = {
  manifestHash: sha256('manifest'),
  corpusHash: sha256('corpus'),
  rubricHash: hashCanonical(FROZEN_RUBRIC),
  controlHash: sha256('controls'),
  injectionHash: sha256('injections'),
  modelHash: sha256('models'),
  runtimeHash: sha256('runtime'),
};

const laneNames = ['P1', 'P2', 'P3', 'P4', 'A1', 'A2', 'C+', 'C-'] as const;
const models: ModelLineages = {
  schemaVersion: 'synac-model-lineages-v1',
  lanes: laneNames.map((lane, index) => ({
    lane,
    trainingOrganization: `organization-${index}`,
    baseModelFamily: `family-${index}`,
    ancestry: 'test ancestry',
    provider: 'ollama',
    immutableModelId: `ollama:test-model-${index + 1}:latest@${(index + 1).toString(16).padStart(12, '0')}`,
    backendFingerprint: `ollama-test-${index}`,
    openWeights: index === 0,
    weightsHash: index === 0 ? sha256('weights') : null,
  })),
};

const runtime: RuntimeConfig = {
  schemaVersion: 'synac-runtime-config-v1',
  runId: 'local-panel-test',
  frozenAt: '2026-08-10T00:00:00.000Z',
  temperature: 0,
  seed: 188,
  tokenLimit: 4096,
  tools: false,
  candidates: 1,
};

function classificationEntry(): ClassificationEntry {
  return {
    key: 'TERM:test-control-entry',
    entryType: 'TERM',
    slug: 'test-control-entry',
    title: 'Test control entry',
    aliases: [],
    summaryText: null,
    senses: [
      {
        key: 'fixture:test-sense',
        order: 0,
        label: null,
        expandedForm: null,
        definitionText: 'Exact qualification evidence with context.',
        examples: [],
        sourceSlugs: ['fixture'],
      },
    ],
  };
}

function evidenceRichEntry(): ClassificationEntry {
  const entry = classificationEntry();
  const sense = entry.senses[0];
  assert.ok(sense);
  return {
    ...entry,
    senses: [
      {
        ...sense,
        label: 'Fixture label',
        expandedForm: 'Fixture Expanded Form',
        examples: ['Fixture example zero.', 'Fixture example one.'],
      },
    ],
  };
}

function planWithJobs(jobs: readonly QualificationJob[]): QualificationPlan {
  const core = {
    schemaVersion: 'synac-local-qualification-plan-v2' as const,
    artifactDirectory: path.resolve('external-artifacts'),
    modelsPath: path.resolve('external-models.json'),
    runtimePath: path.resolve('external-runtime.json'),
    endpoint: 'http://127.0.0.1:11434',
    contextWindow: 8192,
    bindings,
    jobs,
  };
  return { ...core, planHash: hashCanonical(core) };
}

function job(overrides: Partial<QualificationJob> = {}): QualificationJob {
  const base = {
    jobId: sha256('job'),
    requestId: sha256('request'),
    sealId: sha256('seal'),
    lane: 'P1' as const,
    role: 'primary' as const,
    kind: 'control' as const,
    subjectId: 'T01-P01',
    targetTagId: 'T01' as const,
    entryKey: 'TERM:test-control-entry',
    entryHash: hashCanonical(classificationEntry()),
    conceptFamilyId: sha256('family-test-control'),
    mirror: 'M1' as const,
    tagOrder: TAG_IDS,
  };
  return { ...base, ...overrides };
}

function control(): ControlRecord {
  return {
    controlId: 'T01-P01',
    tagId: 'T01',
    entryKey: 'TERM:test-control-entry',
    entryHash: hashCanonical(classificationEntry()),
    label: 'applicable',
    rubricAnchorId: 'T01-P01',
    evidenceKind: 'public-rubric-anchor',
    qualificationSplit: 'validation',
  };
}

function context(
  stateDirectory: string,
  jobs: readonly QualificationJob[] = [job()],
  entry: ClassificationEntry = classificationEntry(),
): TestContext {
  const corpus: CorpusSnapshot = {
    schemaVersion: 'synac-classification-corpus-v1',
    contentVersion: 'test',
    entries: [{ entry, entryHash: hashCanonical(entry) }],
    corpusHash: bindings.corpusHash,
  };
  const controls: ControlSuite = {
    schemaVersion: 'synac-source-controls-v1',
    targetCount: 660,
    actualCount: 1,
    protocolReady: true,
    reviewedFiles: [],
    controls: [control()],
    perTag: TAG_IDS.map((tagId) => ({
      tagId,
      positive: tagId === 'T01' ? 1 : 0,
      negative: 0,
      positiveShortfall: tagId === 'T01' ? 29 : 30,
      negativeShortfall: 30,
      eligible: false,
    })),
    controlHash: bindings.controlHash,
  };
  const injections: InjectionSuite = {
    schemaVersion: 'synac-injection-packets-v1',
    packets: [],
    packetHash: bindings.injectionHash,
  };
  return {
    plan: planWithJobs(jobs),
    rubric: FROZEN_RUBRIC,
    corpus,
    controls,
    injections,
    models,
    runtime,
    stateDirectory,
  };
}

function panelContent(
  requestJob: QualificationJob,
  quote = 'Exact qualification evidence',
) {
  return {
    request_id: requestJob.requestId,
    entry_hash: requestJob.entryHash,
    rubric_hash: bindings.rubricHash,
    seal_id: requestJob.sealId,
    injection_suspected: requestJob.kind === 'injection',
    decisions: requestJob.tagOrder.map((tagId) => {
      const tag = FROZEN_RUBRIC.tags.find(
        (candidate) => candidate.id === tagId,
      );
      assert.ok(tag);
      if (tagId === requestJob.targetTagId) {
        return {
          tag_id: tagId,
          verdict: 'yes',
          p_applicable: 100,
          rule_ids: [tag.inclusionRules[0].id],
          evidence: [
            {
              sense_key: 'fixture:test-sense',
              field: 'definition',
              example_index: null,
              quote,
            },
          ],
          counterevidence: '',
        };
      }
      return {
        tag_id: tagId,
        verdict: 'no',
        p_applicable: 0,
        rule_ids: [tag.exclusionRules[0].id],
        evidence: [],
        counterevidence: '',
      };
    }),
  };
}

function observedEmptyAffirmativeContent(requestJob: QualificationJob) {
  const content = panelContent(requestJob);
  return {
    ...content,
    decisions: content.decisions.map((decision) =>
      decision.verdict === 'yes' ? { ...decision, evidence: [] } : decision,
    ),
  };
}

function observedInvalidLabelContent(requestJob: QualificationJob) {
  const content = panelContent(requestJob);
  return {
    ...content,
    decisions: content.decisions.map((decision) =>
      decision.verdict === 'yes'
        ? {
            ...decision,
            evidence: [
              {
                sense_key: 'fixture:test-sense',
                field: 'label',
                example_index: null,
                quote: 'Test control entry',
              },
            ],
          }
        : decision,
    ),
  };
}

function richEvidenceContent(requestJob: QualificationJob) {
  const content = panelContent(requestJob);
  return {
    ...content,
    decisions: content.decisions.map((decision) =>
      decision.verdict === 'yes'
        ? {
            ...decision,
            evidence: [
              {
                sense_key: 'fixture:test-sense',
                field: 'definition',
                example_index: null,
                quote: 'Exact qualification evidence',
              },
              {
                sense_key: 'fixture:test-sense',
                field: 'label',
                example_index: null,
                quote: 'Fixture label',
              },
              {
                sense_key: 'fixture:test-sense',
                field: 'example',
                example_index: 1,
                quote: 'Fixture example one.',
              },
            ],
          }
        : decision,
    ),
  };
}

function observedForeignRuleContent(requestJob: QualificationJob) {
  const content = panelContent(requestJob);
  return {
    ...content,
    decisions: content.decisions.map((decision, index) => {
      if (index !== 1) return decision;
      const foreignTag = FROZEN_RUBRIC.tags.find(
        (tag) => tag.id !== decision.tag_id,
      );
      assert.ok(foreignTag);
      return {
        ...decision,
        rule_ids: [foreignTag.inclusionRules[0].id],
      };
    }),
  };
}

function outerResponse(request: OllamaRequest, content: unknown) {
  return {
    model: request.model,
    created_at: '2026-08-10T00:00:01.000Z',
    message: {
      role: 'assistant',
      content: typeof content === 'string' ? content : JSON.stringify(content),
    },
    done: true,
    total_duration: 1000,
    prompt_eval_count: 200,
    eval_count: 100,
  };
}

const noBindingCheck = async (): Promise<void> => undefined;

const primaryKey = Buffer.alloc(32, 31).toString('base64');
const arbiterKey = Buffer.alloc(32, 32).toString('base64');

function storage(stateDirectory: string): QualificationStorageOptions {
  return {
    repositoryRoot: path.resolve('.'),
    environment: {
      SYNAC_SEALED_STORE_DIR: path.join(stateDirectory, 'sealed'),
      SYNAC_SEALED_KEY_PRIMARY: primaryKey,
      SYNAC_SEALED_KEY_ARBITER: arbiterKey,
    },
    modelCatalogTransport: async () => ({
      status: 200,
      body: {
        models: models.lanes.map((lane) => {
          const parsed = parseOllamaImmutableModelId(lane.immutableModelId);
          return {
            name: parsed.actualTag,
            digest: `${parsed.pinnedDigest}${'0'.repeat(52)}`,
          };
        }),
      },
    }),
  };
}

test('qualification request uses installed Ollama tag, not immutable catalog ID', () => {
  const request = buildOllamaRequest(
    context('C:\\external\\state', [job()]),
    job(),
  );
  assert.equal(request.model, 'test-model-1:latest');
  assert.match(
    request.messages[0]?.content ?? '',
    /Every yes verdict must include at least one such quote/,
  );
  const format = request.format as {
    properties: {
      request_id: { const: string };
      entry_hash: { const: string };
      rubric_hash: { const: string };
      seal_id: { const: string };
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
  assert.equal(format.properties.request_id.const, job().requestId);
  assert.equal(format.properties.entry_hash.const, job().entryHash);
  assert.equal(format.properties.rubric_hash.const, bindings.rubricHash);
  assert.equal(format.properties.seal_id.const, job().sealId);
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
    TAG_IDS,
  );
  const firstTag = FROZEN_RUBRIC.tags[0];
  assert.ok(firstTag);
  const inclusionRule = firstTag.inclusionRules[0]?.id;
  const exclusionRule = firstTag.exclusionRules[0]?.id;
  assert.ok(inclusionRule);
  assert.ok(exclusionRule);
  assert.ok(
    firstSlot.oneOf[0]?.properties.rule_ids.items.enum.includes(inclusionRule),
  );
  assert.equal(
    firstSlot.oneOf[0]?.properties.rule_ids.items.enum.includes(exclusionRule),
    false,
  );
  assert.ok(
    firstSlot.oneOf[1]?.properties.rule_ids.items.enum.includes(exclusionRule),
  );
  assert.ok(
    firstSlot.oneOf[2]?.properties.rule_ids.items.enum.includes(inclusionRule),
  );
  assert.ok(
    firstSlot.oneOf[2]?.properties.rule_ids.items.enum.includes(exclusionRule),
  );
  const evidenceVariants =
    firstSlot.oneOf[0]?.properties.evidence.items.oneOf ?? [];
  assert.deepEqual(
    evidenceVariants.map((variant) => ({
      senseKey: variant.properties.sense_key.const,
      field: variant.properties.field.const,
      exampleIndex: variant.properties.example_index.const,
    })),
    [
      {
        senseKey: 'fixture:test-sense',
        field: 'definition',
        exampleIndex: null,
      },
    ],
  );
  const reversedJob = job({ tagOrder: [...TAG_IDS].reverse() });
  const reversed = buildOllamaRequest(
    context('C:\\external\\state', [reversedJob]),
    reversedJob,
  ).format as typeof format;
  assert.deepEqual(
    reversed.properties.decisions.items.map(
      (slot) => slot.oneOf[0]?.properties.tag_id.const,
    ),
    [...TAG_IDS].reverse(),
  );
});

test('qualification execution order is lane-major, then mirror/kind/job ID', () => {
  const values = [
    job({ lane: 'A1', role: 'arbiter', jobId: sha256('a1') }),
    job({
      lane: 'P1',
      mirror: 'M2',
      kind: 'injection',
      jobId: sha256('p1-m2-i'),
    }),
    job({
      lane: 'P1',
      mirror: 'M1',
      kind: 'injection',
      jobId: sha256('p1-m1-i'),
    }),
    job({
      lane: 'P1',
      mirror: 'M1',
      kind: 'control',
      jobId: sha256('p1-m1-c'),
    }),
    job({ lane: 'P2', jobId: sha256('p2') }),
  ].sort(compareQualificationJobs);
  assert.deepEqual(
    values.map((value) => `${value.lane}/${value.mirror}/${value.kind}`),
    [
      'P1/M1/control',
      'P1/M1/injection',
      'P1/M2/injection',
      'P2/M1/control',
      'A1/M1/control',
    ],
  );
});

test('source-shaped grammar and validator accept real definition, label, expanded form, and example tuples', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-rich-evidence-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const entry = evidenceRichEntry();
  const requestJob = job({ entryHash: hashCanonical(entry) });
  const execution = context(stateDirectory, [requestJob], entry);
  const request = buildOllamaRequest(execution, requestJob);
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
      ['example', 1],
    ],
  );
  const result = await executeQualificationJobs(
    execution,
    async (_endpoint, transportRequest) => ({
      status: 200,
      body: outerResponse(transportRequest, richEvidenceContent(requestJob)),
      elapsedMs: 2,
    }),
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 0 });
  const [terminal] = await readQualificationResults(
    execution,
    storage(stateDirectory),
  );
  assert.deepEqual(
    terminal?.evidence.map((value) => value.field),
    ['definition', 'label', 'example'],
  );
});

test('oversized per-entry evidence grammar fails during request construction', () => {
  const base = evidenceRichEntry();
  const sense = base.senses[0];
  assert.ok(sense);
  const entry: ClassificationEntry = {
    ...base,
    senses: [
      {
        ...sense,
        examples: Array.from(
          { length: 129 },
          (_, index) => `Example ${index}.`,
        ),
      },
    ],
  };
  const requestJob = job({ entryHash: hashCanonical(entry) });
  assert.throws(
    () =>
      buildOllamaRequest(
        context('C:\\external\\state', [requestJob], entry),
        requestJob,
      ),
    /source evidence variants exceed frozen 128 limit/,
  );
});

test('qualification digest drift fails before inference transport', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-model-drift-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const options = storage(stateDirectory);
  let inferenceCalls = 0;
  await assert.rejects(
    executeQualificationJobs(
      context(stateDirectory),
      async () => {
        inferenceCalls += 1;
        throw new Error('must not infer');
      },
      undefined,
      noBindingCheck,
      {
        ...options,
        modelCatalogTransport: async () => ({
          status: 200,
          body: {
            models: [
              {
                name: 'test-model-1:latest',
                digest: '0'.repeat(64),
              },
            ],
          },
        }),
      },
    ),
    /digest drift/,
  );
  assert.equal(inferenceCalls, 0);
});

test('malformed model JSON gets one byte-identical retry, then a valid terminal result resumes without calls', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-retry-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  const execution = context(stateDirectory, [requestJob]);
  const requests: OllamaRequest[] = [];
  const transport: OllamaTransport = async (_endpoint, request) => {
    requests.push(request);
    return {
      status: 200,
      body: outerResponse(
        request,
        requests.length === 1 ? 'not-json' : panelContent(requestJob),
      ),
      elapsedMs: 12,
    };
  };
  const first = await executeQualificationJobs(
    execution,
    transport,
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(first, { completed: 1, skipped: 0, abstained: 0 });
  assert.equal(requests.length, 2);
  assert.equal(canonicalJson(requests[0]), canonicalJson(requests[1]));
  assert.equal(requests[0].stream, false);
  assert.equal(requests[0].options.temperature, 0);
  assert.equal(requests[0].options.seed, runtime.seed);
  assert.equal(requests[0].options.num_ctx, 8192);
  assert.equal(
    (requests[0].format as Record<string, unknown>).additionalProperties,
    false,
  );
  const plaintextIndexes = await Promise.all(
    ['progress', 'results'].map((kind) =>
      readFile(
        path.join(stateDirectory, `qualification-primary-${kind}.ndjson`),
        'utf8',
      ),
    ),
  );
  const sealed = await readFile(
    path.join(stateDirectory, 'sealed', 'primary.sealed.ndjson'),
    'utf8',
  );
  for (const persisted of [...plaintextIndexes, sealed]) {
    for (const forbidden of [
      'not-json',
      'Exact qualification evidence',
      'TERM:test-control-entry',
      'T01-P01',
      'applicable',
      'counterevidence',
      'decisions',
      'messages',
      'pApplicable',
      'ruleIds',
      'verdict',
    ]) {
      assert.equal(
        persisted.includes(forbidden),
        false,
        `plaintext leak: ${forbidden}`,
      );
    }
  }
  assert.equal(sealed.trim().split('\n').length, 3);

  let resumedCalls = 0;
  const resumed = await executeQualificationJobs(
    execution,
    async () => {
      resumedCalls += 1;
      throw new Error('must not call');
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(resumed, { completed: 0, skipped: 1, abstained: 0 });
  assert.equal(resumedCalls, 0);
});

test('affirmative empty evidence retries, then exact affirmative evidence passes', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-affirmative-evidence-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  const execution = context(stateDirectory, [requestJob]);
  let calls = 0;
  const result = await executeQualificationJobs(
    execution,
    async (_endpoint, request) => {
      calls += 1;
      return {
        status: 200,
        body: outerResponse(
          request,
          calls === 1
            ? observedEmptyAffirmativeContent(requestJob)
            : panelContent(requestJob),
        ),
        elapsedMs: 2,
      };
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 0 });
  assert.equal(calls, 2);
  const [terminal] = await readQualificationResults(
    execution,
    storage(stateDirectory),
  );
  assert.equal(terminal?.status, 'valid');
  assert.equal(terminal?.verdict, 'yes');
  assert.equal(terminal?.evidence[0]?.quote, 'Exact qualification evidence');
});

test('nonexistent label evidence retries without repair, then valid definition passes', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-invalid-label-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  let calls = 0;
  const result = await executeQualificationJobs(
    context(stateDirectory, [requestJob]),
    async (_endpoint, request) => {
      calls += 1;
      return {
        status: 200,
        body: outerResponse(
          request,
          calls === 1
            ? observedInvalidLabelContent(requestJob)
            : panelContent(requestJob),
        ),
        elapsedMs: 2,
      };
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 0 });
  assert.equal(calls, 2);
});

test('reversed ordered decisions retry a foreign polarity rule, then pass', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-ordered-rules-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job({ tagOrder: [...TAG_IDS].reverse() });
  let calls = 0;
  const result = await executeQualificationJobs(
    context(stateDirectory, [requestJob]),
    async (_endpoint, request) => {
      calls += 1;
      return {
        status: 200,
        body: outerResponse(
          request,
          calls === 1
            ? observedForeignRuleContent(requestJob)
            : panelContent(requestJob),
        ),
        elapsedMs: 2,
      };
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 0 });
  assert.equal(calls, 2);
});

test('foreign root echo retries without repair, then valid echoes pass', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-root-echo-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  let calls = 0;
  const result = await executeQualificationJobs(
    context(stateDirectory, [requestJob]),
    async (_endpoint, request) => {
      calls += 1;
      const content = panelContent(requestJob);
      return {
        status: 200,
        body: outerResponse(
          request,
          calls === 1
            ? { ...content, request_id: sha256('foreign-request') }
            : content,
        ),
        elapsedMs: 2,
      };
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 0 });
  assert.equal(calls, 2);
});

test('schema-invalid evidence retries once and becomes explicit abstention', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-schema-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  let calls = 0;
  const result = await executeQualificationJobs(
    context(stateDirectory, [requestJob]),
    async (_endpoint, request) => {
      calls += 1;
      return {
        status: 200,
        body: outerResponse(
          request,
          panelContent(requestJob, 'foreign evidence quote'),
        ),
        elapsedMs: 2,
      };
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 1 });
  assert.equal(calls, 2);
  const [terminal] = await readQualificationResults(
    context(stateDirectory, [requestJob]),
    storage(stateDirectory),
  );
  assert.equal(terminal.status, 'abstain');
  assert.equal(terminal.verdict, 'abstain');
  assert.match(terminal.reason ?? '', /not exact live sense text/);
});

test('dangling started attempt becomes abstention on resume without a duplicate call', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-interrupted-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  const execution = context(stateDirectory, [requestJob]);
  const request = buildOllamaRequest(execution, requestJob);
  await writeFile(
    path.join(stateDirectory, 'qualification-primary-progress.ndjson'),
    `${JSON.stringify({
      event: 'attempt_started',
      schemaVersion: 'synac-local-qualification-progress-v2',
      planHash: execution.plan.planHash,
      jobId: requestJob.jobId,
      requestId: requestJob.requestId,
      requestHash: hashCanonical(request),
      attempt: 1,
      startedAt: '2026-08-10T00:00:00.000Z',
    })}\n`,
  );
  let calls = 0;
  const result = await executeQualificationJobs(
    execution,
    async () => {
      calls += 1;
      throw new Error('must not call');
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(result, { completed: 1, skipped: 0, abstained: 1 });
  assert.equal(calls, 0);
});

test('a sealed attempt with a missing pointer is recovered before retry without duplicating the call', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-orphan-attempt-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const requestJob = job();
  const execution = context(stateDirectory, [requestJob]);
  let firstCalls = 0;
  const partial = await executeQualificationJobs(
    execution,
    async (_endpoint, request) => {
      firstCalls += 1;
      return {
        status: 200,
        body: outerResponse(request, 'not-json'),
        elapsedMs: 1,
      };
    },
    1,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(partial, { completed: 0, skipped: 0, abstained: 0 });
  assert.equal(firstCalls, 1);
  const progressPath = path.join(
    stateDirectory,
    'qualification-primary-progress.ndjson',
  );
  const [started] = (await readFile(progressPath, 'utf8')).trim().split('\n');
  await writeFile(progressPath, `${started}\n`);

  let resumedCalls = 0;
  const resumed = await executeQualificationJobs(
    execution,
    async (_endpoint, request) => {
      resumedCalls += 1;
      return {
        status: 200,
        body: outerResponse(request, panelContent(requestJob)),
        elapsedMs: 1,
      };
    },
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  assert.deepEqual(resumed, { completed: 1, skipped: 0, abstained: 0 });
  assert.equal(resumedCalls, 1);
  assert.equal(
    (await readFile(progressPath, 'utf8')).trim().split('\n').length,
    4,
  );
});

test('binding drift rejects before transport', async (contextTest) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'synac-panel-drift-'),
  );
  contextTest.after(async () =>
    rm(stateDirectory, { recursive: true, force: true }),
  );
  const execution = context(stateDirectory);
  assert.throws(
    () =>
      assertQualificationBindings(execution.plan, {
        ...bindings,
        runtimeHash: sha256('drifted-runtime'),
      }),
    /binding drift/,
  );
  let calls = 0;
  await assert.rejects(
    executeQualificationJobs(
      execution,
      async () => {
        calls += 1;
        throw new Error('must not call');
      },
      undefined,
      async () => {
        throw new Error('qualification binding drift: test');
      },
    ),
    /binding drift/,
  );
  assert.equal(calls, 0);
});

async function writeOneValidResult(
  stateDirectory: string,
): Promise<TestContext> {
  const requestJob = job();
  const execution = context(stateDirectory, [requestJob]);
  await executeQualificationJobs(
    execution,
    async (_endpoint, request) => ({
      status: 200,
      body: outerResponse(request, panelContent(requestJob)),
      elapsedMs: 1,
    }),
    undefined,
    noBindingCheck,
    storage(stateDirectory),
  );
  return execution;
}

test('missing and authentication-failed result seals stop resume and report before transport', async (contextTest) => {
  for (const failure of ['missing', 'tampered'] as const) {
    await contextTest.test(failure, async () => {
      const stateDirectory = await mkdtemp(
        path.join(os.tmpdir(), `synac-panel-${failure}-`),
      );
      try {
        const execution = await writeOneValidResult(stateDirectory);
        const sealedPath = path.join(
          stateDirectory,
          'sealed',
          'primary.sealed.ndjson',
        );
        if (failure === 'missing') {
          await writeFile(sealedPath, '');
        } else {
          const envelopes = (await readFile(sealedPath, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line) as Record<string, string>);
          const terminal = envelopes.at(-1);
          assert.ok(terminal);
          terminal.ciphertext = `${terminal.ciphertext.startsWith('A') ? 'B' : 'A'}${terminal.ciphertext.slice(1)}`;
          await writeFile(
            sealedPath,
            `${envelopes.map((envelope) => JSON.stringify(envelope)).join('\n')}\n`,
          );
        }
        let calls = 0;
        await assert.rejects(
          executeQualificationJobs(
            execution,
            async () => {
              calls += 1;
              throw new Error('must not call');
            },
            undefined,
            noBindingCheck,
            storage(stateDirectory),
          ),
          failure === 'missing' ? /missing record/ : /authentication failed/,
        );
        await assert.rejects(
          readQualificationResults(execution, storage(stateDirectory)),
          failure === 'missing' ? /missing record/ : /authentication failed/,
        );
        assert.equal(calls, 0);
      } finally {
        await rm(stateDirectory, { recursive: true, force: true });
      }
    });
  }
  await contextTest.test('wrong primary key', async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'synac-panel-wrong-key-'),
    );
    try {
      const execution = await writeOneValidResult(stateDirectory);
      const wrong = storage(stateDirectory);
      const wrongOptions: QualificationStorageOptions = {
        ...wrong,
        environment: {
          ...wrong.environment,
          SYNAC_SEALED_KEY_PRIMARY: Buffer.alloc(32, 99).toString('base64'),
        },
      };
      let calls = 0;
      await assert.rejects(
        executeQualificationJobs(
          execution,
          async () => {
            calls += 1;
            throw new Error('must not call');
          },
          undefined,
          noBindingCheck,
          wrongOptions,
        ),
        /authentication failed/,
      );
      assert.equal(calls, 0);
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });
});

test('foreign-role and replayed seals stop resume before transport', async (contextTest) => {
  await contextTest.test('foreign role', async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'synac-panel-foreign-seal-'),
    );
    try {
      const execution = context(stateDirectory);
      const options = storage(stateDirectory);
      const store = await openSealedStoreRole(
        sealedStoreConfig(options.environment, options.repositoryRoot),
        'arbiter',
        options.environment,
      );
      const sealId = sha256(
        `qualification-result\0${execution.plan.planHash}\0${execution.plan.jobs[0].jobId}`,
      );
      await store.append(sealId, { marker: 'foreign' }, (value) => value);
      let calls = 0;
      await assert.rejects(
        executeQualificationJobs(
          execution,
          async () => {
            calls += 1;
            throw new Error('must not call');
          },
          undefined,
          noBindingCheck,
          options,
        ),
        /sealed for foreign role/,
      );
      assert.equal(calls, 0);
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });

  await contextTest.test('replay', async () => {
    const stateDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'synac-panel-replayed-seal-'),
    );
    try {
      const execution = await writeOneValidResult(stateDirectory);
      const sealedPath = path.join(
        stateDirectory,
        'sealed',
        'primary.sealed.ndjson',
      );
      const firstEnvelope = (await readFile(sealedPath, 'utf8')).split('\n')[0];
      await appendFile(sealedPath, `${firstEnvelope}\n`);
      let calls = 0;
      await assert.rejects(
        executeQualificationJobs(
          execution,
          async () => {
            calls += 1;
            throw new Error('must not call');
          },
          undefined,
          noBindingCheck,
          storage(stateDirectory),
        ),
        /seal replay detected while indexing/,
      );
      assert.equal(calls, 0);
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });
});

function metricControl(
  tagId: TagId,
  polarity: 'positive' | 'negative',
  split: 'calibration' | 'validation',
): ControlRecord {
  const marker = polarity === 'positive' ? 'P' : 'N';
  const splitMarker = split === 'calibration' ? 'C' : 'V';
  const id = `${tagId}-${marker}-${splitMarker}`;
  return {
    controlId: id,
    tagId,
    entryKey: `TERM:${id.toLocaleLowerCase('en-US')}`,
    entryHash: sha256(`entry-${id}`),
    label: polarity === 'positive' ? 'applicable' : 'not_applicable',
    rubricAnchorId: id,
    evidenceKind: 'public-rubric-anchor',
    qualificationSplit: split,
  };
}

function metricResult(
  jobValue: QualificationJob,
  expected: 0 | 1,
): QualificationResult {
  return {
    schemaVersion: 'synac-local-qualification-result-v1',
    planHash: 'pending',
    jobId: jobValue.jobId,
    requestId: jobValue.requestId,
    responseId: sha256(`response-${jobValue.jobId}`),
    lane: jobValue.lane,
    role: jobValue.role,
    kind: jobValue.kind,
    subjectId: jobValue.subjectId,
    targetTagId: jobValue.targetTagId,
    mirror: jobValue.mirror,
    status: 'valid',
    reason: null,
    attempt: 1,
    verdict: expected === 1 ? 'yes' : 'no',
    pApplicable: expected === 1 ? 100 : 0,
    injectionSuspected: jobValue.kind === 'injection',
    ruleIds: [],
    evidence: [],
    model: `test-${jobValue.lane}`,
    createdAt: '2026-08-10T00:00:00.000Z',
    callCount: 1,
    elapsedMs: 1,
    totalDurationNs: 1,
    promptTokens: 1,
    completionTokens: 1,
    rawResponseHash: sha256(jobValue.jobId),
  };
}

test('qualification metrics pass perfect mirrors and fail abstentions as errors', () => {
  const controls = TAG_IDS.flatMap((tagId) =>
    (['calibration', 'validation'] as const).flatMap((split) => [
      metricControl(tagId, 'positive', split),
      metricControl(tagId, 'negative', split),
    ]),
  );
  const sharedSource = controls.find(
    (controlValue) => controlValue.controlId === 'T01-P-V',
  );
  assert.ok(sharedSource);
  const sharedSibling: ControlRecord = {
    ...sharedSource,
    controlId: 'T01-P-V-SIBLING',
    entryKey: 'TERM:t01-p-v-sibling',
    entryHash: sha256('entry-T01-P-V-SIBLING'),
  };
  controls.push(sharedSibling);
  const sharedFamilyId = sha256('family-T01-P-V');
  const jobs: QualificationJob[] = [];
  for (const lane of ['P1', 'P2', 'P3', 'P4', 'A1', 'A2'] as const) {
    for (const controlValue of controls) {
      for (const mirror of ['M1', 'M2'] as const) {
        jobs.push(
          job({
            jobId: sha256(`${lane}-${controlValue.controlId}-${mirror}`),
            requestId: sha256(
              `request-${lane}-${controlValue.controlId}-${mirror}`,
            ),
            sealId: sha256(`seal-${lane}-${controlValue.controlId}-${mirror}`),
            lane,
            role: lane.startsWith('P') ? 'primary' : 'arbiter',
            subjectId: controlValue.controlId,
            targetTagId: controlValue.tagId,
            entryKey: controlValue.entryKey,
            entryHash: controlValue.entryHash,
            conceptFamilyId:
              controlValue.controlId === sharedSibling.controlId
                ? sharedFamilyId
                : sha256(`family-${controlValue.controlId}`),
            mirror,
          }),
        );
      }
    }
  }
  const plan = planWithJobs(jobs);
  const expectedByControl = new Map(
    controls.map(
      (controlValue) =>
        [
          controlValue.controlId,
          controlValue.label === 'applicable' ? 1 : 0,
        ] as const,
    ),
  );
  const results = jobs.map((jobValue) => {
    const result = metricResult(
      jobValue,
      expectedByControl.get(jobValue.subjectId) ?? 0,
    );
    return { ...result, planHash: plan.planHash };
  });
  const suite: ControlSuite = {
    schemaVersion: 'synac-source-controls-v1',
    targetCount: 660,
    actualCount: controls.length,
    protocolReady: true,
    reviewedFiles: [],
    controls,
    perTag: TAG_IDS.map((tagId) => ({
      tagId,
      positive: 2,
      negative: 2,
      positiveShortfall: 28,
      negativeShortfall: 28,
      eligible: false,
    })),
    controlHash: sha256('metric-controls'),
  };
  const perfect = computeQualificationReport(plan, suite, results);
  assert.equal(perfect.pass, true);
  assert.ok(perfect.lanes.every((lane) => lane.macroF1 === 1));
  assert.equal(perfect.meanPrimaryErrorPhi, 0);
  const sharedCount = perfect.controlCounts.find(
    (count) =>
      count.tagId === 'T01' &&
      count.polarity === 'positive' &&
      count.split === 'validation',
  );
  assert.deepEqual(sharedCount, {
    tagId: 'T01',
    polarity: 'positive',
    split: 'validation',
    cellCount: 2,
    uniqueFamilyCount: 1,
  });
  const oneSiblingWrong = results.map((result) =>
    result.lane === 'P1' && result.subjectId === sharedSibling.controlId
      ? { ...result, verdict: 'no' as const, pApplicable: 0 }
      : result,
  );
  const conservativelyWrong = computeQualificationReport(
    plan,
    suite,
    oneSiblingWrong,
  );
  assert.equal(conservativelyWrong.pass, false);
  assert.ok(
    (conservativelyWrong.lanes.find((lane) => lane.lane === 'P1')
      ?.mirrorAgreementOverall ?? 1) < 1,
  );
  const crossingSuite: ControlSuite = {
    ...suite,
    controls: suite.controls.map((controlValue) =>
      controlValue.controlId === sharedSibling.controlId
        ? { ...controlValue, qualificationSplit: 'calibration' as const }
        : controlValue,
    ),
  };
  const crossing = computeQualificationReport(plan, crossingSuite, results);
  assert.equal(crossing.pass, false);
  assert.ok(
    crossing.failures.some((failure) =>
      failure.includes('crosses qualification halves'),
    ),
  );
  const missingGroupSuite: ControlSuite = {
    ...suite,
    controls: suite.controls.filter(
      (controlValue) =>
        !(
          controlValue.tagId === 'T11' &&
          controlValue.label === 'not_applicable' &&
          controlValue.qualificationSplit === 'calibration'
        ),
    ),
  };
  const missingGroup = computeQualificationReport(
    plan,
    missingGroupSuite,
    results,
  );
  assert.equal(missingGroup.pass, false);
  assert.ok(
    missingGroup.failures.includes(
      'T11/negative/calibration: no unique control family',
    ),
  );
  const removed = results.filter(
    (result) =>
      !(
        result.lane === 'P1' &&
        result.subjectId === 'T01-P-V' &&
        result.mirror === 'M2'
      ),
  );
  const withAbstention = computeQualificationReport(plan, suite, removed);
  assert.equal(withAbstention.pass, false);
  assert.ok(
    withAbstention.lanes.find((lane) => lane.lane === 'P1')
      ?.mirrorAgreementOverall !== 1,
  );
});
