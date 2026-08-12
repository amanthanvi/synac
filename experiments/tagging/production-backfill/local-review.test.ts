import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REVIEW_ROLES,
  buildReviewPacket,
  buildReviewedReport,
  responseSchema,
  reviewBatchWithRetry,
  validateDecisionResponse,
  type Contract,
  type PreparedCandidate,
  type ResolvedDecision,
  type ReviewDecision,
  type ReviewManifest,
  type RoleId,
  type Rubric,
  type TerraCandidate,
} from './local-review.ts';

const contract: Contract = {
  slug: 'identity-access',
  name: 'Identity and access',
  definition: 'Digital identities and logical access policy.',
  inclusionRules: ['Identity lifecycle.', 'Authenticators and factors.'],
  exclusionRules: ['Facility access by itself.'],
};

const rubric: Rubric = {
  taxonomyVersion: 2,
  globalRules: ['Apply only when central.'],
  contracts: [
    contract,
    ...Array.from(
      { length: 10 },
      (_value, index): Contract => ({
        slug: `tag-${index}`,
        name: `Tag ${index}`,
        definition: `Definition ${index}`,
        inclusionRules: [`Include ${index}`],
        exclusionRules: [`Exclude ${index}`],
      }),
    ),
  ],
};

function preparedCandidate(index = 0): PreparedCandidate {
  return {
    sourceIndex: index,
    entryKey: `entry-${index}`,
    entryContentHash: `${index}`.padStart(64, 'a'),
    tagSlug: contract.slug,
    score: 0.99,
    entry: {
      key: `entry-${index}`,
      entryType: 'TERM',
      title: `Entry ${index}`,
      aliases: [],
      summaryText: 'A central identity topic.',
      senses: [
        {
          key: `sense-${index}`,
          order: 0,
          label: undefined,
          expandedForm: undefined,
          definitionText: 'An identity authenticator.',
          examples: [],
        },
      ],
      entryContentHash: `${index}`.padStart(64, 'a'),
    },
    contract,
  };
}

function decision(
  index: number,
  verdict: ReviewDecision['verdict'],
  confidence = 95,
): ReviewDecision {
  return {
    index,
    verdict,
    confidence,
    ruleIds: verdict === 'ABSTAIN' ? [] : ['include:1'],
    evidenceSenseKeys: verdict === 'ABSTAIN' ? [] : [`sense-${index}`],
    injectionSuspected: false,
  };
}

function resolved(
  value: ReviewDecision,
  validResponse = true,
): ResolvedDecision {
  return { decision: value, validResponse, attempts: validResponse ? 1 : 2 };
}

function manifest(): ReviewManifest {
  return {
    schemaVersion: 'synac-local-adversarial-review-manifest-v4',
    source: {
      productionManifestHash: 'a'.repeat(64),
      contentVersion: 'b'.repeat(64),
      corpusHash: 'c'.repeat(64),
      entryIndexHash: 'd'.repeat(64),
      rubricHash: 'e'.repeat(64),
      candidatesHash: 'f'.repeat(64),
    },
    config: {
      batchSize: 5,
      temperature: 0,
      seed: 20260810,
      numCtx: 8192,
      think: false,
      retryCount: 1,
      acceptanceConfidence: 90,
    },
    roles: REVIEW_ROLES.map((role) => ({
      id: role.id,
      model: role.model,
      order: role.order,
      promptHash: '1'.repeat(64),
    })),
    ollama: {
      baseUrl: 'http://127.0.0.1:11434',
      version: 'test',
      models: REVIEW_ROLES.map((role) => ({
        requestedModel: role.model,
        ollamaName: role.model,
        digest: `${role.id}-digest`,
      })),
    },
    configHash: '2'.repeat(64),
  };
}

test('review packets contain local index, Entry, and exactly one contract without Terra score or lane', () => {
  const packet = buildReviewPacket(
    REVIEW_ROLES[0],
    [preparedCandidate()],
    rubric,
    'e'.repeat(64),
  );
  assert.equal(packet.candidates.length, 1);
  assert.deepEqual(Object.keys(packet.candidates[0]).sort(), [
    'contract',
    'entry',
    'index',
  ]);
  assert.equal(packet.candidates[0].contract.slug, contract.slug);
  assert.deepEqual(packet.candidates[0].contract.inclusionRules[0], {
    id: 'include:1',
    text: contract.inclusionRules[0],
  });
  assert.deepEqual(packet.candidates[0].contract.exclusionRules[0], {
    id: 'exclude:1',
    text: contract.exclusionRules[0],
  });
  assert.equal('score' in packet.candidates[0], false);
  assert.equal('lane' in packet.candidates[0], false);
});

test('response schema pins tuple order, rule IDs, and evidence keys per candidate', () => {
  const schema = responseSchema([preparedCandidate(0), preparedCandidate(1)]);
  const items = schema.properties.decisions.items;
  assert.equal(items.length, 2);
  assert.equal(items[0].oneOf[0].properties.index.const, 0);
  assert.equal(items[1].oneOf[0].properties.index.const, 1);
  assert.deepEqual(items[0].oneOf[0].properties.ruleIds.items.enum, [
    'include:1',
    'include:2',
  ]);
  assert.deepEqual(items[0].oneOf[1].properties.ruleIds.items.enum, [
    'global:substantive-topic',
    'exclude:1',
  ]);
  assert.equal(items[0].oneOf[0].properties.evidenceSenseKeys.minItems, 1);
  assert.equal(items[0].oneOf[2].properties.evidenceSenseKeys.maxItems, 0);
  assert.deepEqual(
    items[0].oneOf[0].properties.confidence.enum,
    [75, 90, 95, 98, 100],
  );
  assert.equal(items[0].oneOf[2].properties.confidence.const, 0);
  assert.deepEqual(items[1].oneOf[0].properties.evidenceSenseKeys.items.enum, [
    'sense-1',
  ]);
});

test('strict response validation rejects wrong indices, extra fields, rules, and sense keys', () => {
  const candidate = preparedCandidate();
  const invalid = JSON.stringify({
    decisions: [
      {
        ...decision(7, 'SUPPORT'),
        ruleIds: ['include:99'],
        evidenceSenseKeys: ['invented-sense'],
        extra: true,
      },
    ],
  });
  const result = validateDecisionResponse(invalid, [candidate]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(
      result.errors.some((error) => error.includes('exact schema')),
      true,
    );
  }

  const valid = validateDecisionResponse(
    JSON.stringify({ decisions: [decision(0, 'SUPPORT')] }),
    [candidate],
  );
  assert.equal(valid.ok, true);
});

test('an invalid Ollama response gets one byte-identical retry and becomes ABSTAIN', async () => {
  const requestBodies: string[] = [];
  const appended: string[] = [];
  const invalidContent = JSON.stringify({
    decisions: [decision(9, 'SUPPORT')],
  });
  const fetchImpl = async (
    _input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    requestBodies.push(String(init?.body));
    return new Response(
      JSON.stringify({
        model: REVIEW_ROLES[0].model,
        created_at: '2026-08-10T00:00:00Z',
        message: { content: invalidContent },
        prompt_eval_count: 10,
        eval_count: 2,
      }),
      { status: 200 },
    );
  };
  let clock = 0;
  const result = await reviewBatchWithRetry({
    role: REVIEW_ROLES[0],
    batchIndex: 0,
    batch: [preparedCandidate()],
    rubric,
    rubricHash: 'e'.repeat(64),
    fetchImpl,
    now: () => {
      clock += 1;
      return clock;
    },
    appendRecord: async (record) => {
      appended.push(JSON.stringify(record));
    },
  });

  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[0], requestBodies[1]);
  assert.equal(appended.length, 2);
  assert.equal(
    result.records.every((record) => record.status === 'invalid'),
    true,
  );
  assert.deepEqual(result.decisions[0], {
    decision: decision(0, 'ABSTAIN', 0),
    validResponse: false,
    attempts: 2,
  });
});

test('a valid saved call resumes without invoking Ollama again', async () => {
  const content = JSON.stringify({ decisions: [decision(0, 'SUPPORT')] });
  const initial = await reviewBatchWithRetry({
    role: REVIEW_ROLES[0],
    batchIndex: 0,
    batch: [preparedCandidate()],
    rubric,
    rubricHash: 'e'.repeat(64),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          model: REVIEW_ROLES[0].model,
          message: { content },
        }),
        { status: 200 },
      ),
  });
  let fetchCount = 0;
  const resumed = await reviewBatchWithRetry({
    role: REVIEW_ROLES[0],
    batchIndex: 0,
    batch: [preparedCandidate()],
    rubric,
    rubricHash: 'e'.repeat(64),
    savedRecords: initial.records,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('unexpected fetch');
    },
  });

  assert.equal(fetchCount, 0);
  assert.equal(resumed.decisions[0].decision.verdict, 'SUPPORT');
  assert.equal(resumed.decisions[0].validResponse, true);
});

test('only dual high-confidence SUPPORT accepts; disagreement reviews and invalid abstains', () => {
  const prepared = [
    preparedCandidate(0),
    preparedCandidate(1),
    preparedCandidate(2),
  ];
  const candidates: TerraCandidate[] = prepared.map(
    ({ entryKey, entryContentHash, tagSlug, score }) => ({
      entryKey,
      entryContentHash,
      tagSlug,
      score,
    }),
  );
  const identity = (candidate: TerraCandidate): string =>
    `${candidate.entryKey}\0${candidate.tagSlug}`;
  const granite = new Map<string, ResolvedDecision>([
    [identity(candidates[0]), resolved(decision(0, 'SUPPORT', 96))],
    [identity(candidates[1]), resolved(decision(1, 'SUPPORT', 96))],
    [identity(candidates[2]), resolved(decision(2, 'ABSTAIN', 0), false)],
  ]);
  const gemma = new Map<string, ResolvedDecision>([
    [identity(candidates[0]), resolved(decision(0, 'SUPPORT', 91))],
    [identity(candidates[1]), resolved(decision(1, 'OPPOSE', 98))],
    [identity(candidates[2]), resolved(decision(2, 'SUPPORT', 99))],
  ]);
  const decisions = new Map<RoleId, ReadonlyMap<string, ResolvedDecision>>([
    ['granite-inclusion', granite],
    ['gemma-exclusion', gemma],
  ]);

  const report = buildReviewedReport({
    candidates,
    rubric,
    manifest: manifest(),
    decisions,
    calls: [],
  });

  assert.equal(report.acceptedCandidateCount, 1);
  assert.equal(report.reviewCount, 1);
  assert.equal(report.abstainCount, 1);
  assert.equal(report.accepted[0].entryKey, candidates[0].entryKey);
  assert.equal(report.review[0].entryKey, candidates[1].entryKey);
  assert.equal(report.abstain[0].entryKey, candidates[2].entryKey);
  assert.equal(report.agreement.differentVerdictCount, 2);
});
