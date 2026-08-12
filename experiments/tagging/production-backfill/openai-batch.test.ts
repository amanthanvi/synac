import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sanitizeResult,
  type EntryPacket,
  type Result,
  type Rubric,
} from './openai-batch.js';

const rubric: Rubric = {
  taxonomyVersion: '2',
  globalRules: ['substantive'],
  contracts: [
    {
      slug: 'cryptography',
      name: 'Cryptography',
      definition: 'Cryptographic topics.',
      inclusionRules: ['Primitives.'],
      exclusionRules: ['Generic encoding.'],
    },
    {
      slug: 'malware',
      name: 'Malware',
      definition: 'Malicious software.',
      inclusionRules: ['Malware families.', 'Malware behavior.'],
      exclusionRules: ['Infrastructure.'],
    },
  ],
};

const expected = {
  key: 'TERM:test',
  entryType: 'TERM',
  title: 'Test',
  aliases: [],
  summaryText: 'Test definition.',
  senses: [
    {
      key: 'source:test',
      order: 0,
      definitionText: 'Test definition.',
      examples: [],
    },
  ],
  entryContentHash: 'expected-hash',
} satisfies EntryPacket;

const validTag = {
  tagSlug: 'cryptography',
  lane: 'AUTO',
  confidence: 99,
  ruleIds: ['include:1', 'global:substantive-topic'],
  evidenceSenseKeys: ['source:test'],
} as const;

test('quarantines an envelope mismatch as a whole-entry abstention', () => {
  const input: Result = {
    entryKey: 'TERM:wrong',
    entryContentHash: 'wrong-hash',
    injectionSuspected: false,
    tags: [{ ...validTag, ruleIds: [...validTag.ruleIds] }],
  };
  const actual = sanitizeResult(input, expected, rubric);
  assert.deepEqual(actual.result, {
    entryKey: expected.key,
    entryContentHash: expected.entryContentHash,
    injectionSuspected: false,
    tags: [],
  });
  assert.deepEqual(actual.quarantine, [
    {
      entryKey: expected.key,
      scope: 'RESULT',
      reasons: [
        `entry key ${input.entryKey} != ${expected.key}`,
        'content hash mismatch',
      ],
    },
  ]);
});

test('quarantines only invalid tags and preserves valid candidates', () => {
  const input: Result = {
    entryKey: expected.key,
    entryContentHash: expected.entryContentHash,
    injectionSuspected: false,
    tags: [
      { ...validTag, ruleIds: [...validTag.ruleIds] },
      {
        tagSlug: 'malware',
        lane: 'AUTO',
        confidence: 99,
        ruleIds: ['include:3'],
        evidenceSenseKeys: ['source:wrong'],
      },
    ],
  };
  const actual = sanitizeResult(input, expected, rubric);
  assert.deepEqual(actual.result.tags, [input.tags[0]]);
  assert.deepEqual(actual.quarantine, [
    {
      entryKey: expected.key,
      scope: 'TAG',
      tagSlug: 'malware',
      reasons: ['bad sense source:wrong', 'bad rule include:3'],
    },
  ]);
});

test('quarantines tags emitted with an injection signal', () => {
  const input: Result = {
    entryKey: expected.key,
    entryContentHash: expected.entryContentHash,
    injectionSuspected: true,
    tags: [{ ...validTag, ruleIds: [...validTag.ruleIds] }],
  };
  const actual = sanitizeResult(input, expected, rubric);
  assert.deepEqual(actual.result.tags, []);
  assert.deepEqual(actual.quarantine, [
    {
      entryKey: expected.key,
      scope: 'RESULT',
      reasons: ['injection result emitted tags'],
    },
  ]);
});
