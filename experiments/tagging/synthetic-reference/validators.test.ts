import assert from 'node:assert/strict';
import test from 'node:test';

import { hashCanonical } from './canonical.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import type { ClassificationDecision, ClassificationEntry } from './types.ts';
import { TAG_IDS } from './types.ts';
import { validateClassificationResponse } from './validators.ts';

const entry: ClassificationEntry = {
  key: 'TERM:test-entry',
  entryType: 'TERM',
  slug: 'test-entry',
  title: 'Café security',
  aliases: [],
  summaryText: null,
  senses: [
    {
      key: 'source:sense',
      order: 0,
      label: null,
      expandedForm: null,
      definitionText: 'A deterministic test definition.',
      examples: [],
      sourceSlugs: ['source'],
    },
  ],
};
const entryHash = hashCanonical(entry);
const rubricHash = hashCanonical(FROZEN_RUBRIC);
const sealId = 'seal-000000000001';

function decisions(): ClassificationDecision[] {
  return TAG_IDS.map((tag_id) => ({
    tag_id,
    verdict: 'no',
    p_applicable: 0,
    rule_ids: ['G01'],
    evidence: [],
    counterevidence: '',
  }));
}

function response() {
  return {
    entry_hash: entryHash,
    rubric_hash: rubricHash,
    seal_id: sealId,
    injection_suspected: false,
    decisions: decisions(),
  };
}

test('valid classification payload passes strict hash, seal, rule, and decision validation', () => {
  assert.deepEqual(
    validateClassificationResponse(response(), {
      entry,
      entryHash,
      rubric: FROZEN_RUBRIC,
      rubricHash,
      sealId,
    }),
    response(),
  );
});

test('invalid payload and hash are rejected', () => {
  assert.throws(
    () =>
      validateClassificationResponse(
        { ...response(), unexpected: true },
        { entry, entryHash, rubric: FROZEN_RUBRIC, rubricHash, sealId },
      ),
    /expected exactly keys/,
  );
  assert.throws(
    () =>
      validateClassificationResponse(
        { ...response(), entry_hash: hashCanonical('wrong') },
        { entry, entryHash, rubric: FROZEN_RUBRIC, rubricHash, sealId },
      ),
    /response\.entry_hash/,
  );
});

test('foreign seal and invalid UTF-8 evidence boundary are rejected', () => {
  assert.throws(
    () =>
      validateClassificationResponse(
        { ...response(), seal_id: 'seal-foreign-0001' },
        { entry, entryHash, rubric: FROZEN_RUBRIC, rubricHash, sealId },
      ),
    /foreign seal/,
  );
  const invalid = response();
  invalid.decisions[0] = {
    ...invalid.decisions[0],
    verdict: 'yes',
    p_applicable: 100,
    evidence: [{ field: 'title', senseKey: null, start: 4, end: 5 }],
  };
  assert.throws(
    () =>
      validateClassificationResponse(invalid, {
        entry,
        entryHash,
        rubric: FROZEN_RUBRIC,
        rubricHash,
        sealId,
      }),
    /UTF-8 code-point boundaries/,
  );
});
