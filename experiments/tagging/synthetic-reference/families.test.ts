import assert from 'node:assert/strict';
import test from 'node:test';

import { hashCanonical, sha256 } from './canonical.ts';
import { buildControls } from './controls.ts';
import { buildConceptFamilies, buildSplitPlan } from './families.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import type { HashedClassificationEntry } from './types.ts';
import { validateControls } from './validators.ts';

function entry(
  keyIndex: number,
  title = `Unique concept ${keyIndex}`,
): HashedClassificationEntry {
  const payload = {
    key: `TERM:concept-${keyIndex}`,
    entryType: 'TERM' as const,
    slug: `concept-${keyIndex}`,
    title,
    aliases: [],
    summaryText: null,
    senses: [
      {
        key: `source:${keyIndex}`,
        order: 0,
        label: null,
        expandedForm: null,
        definitionText: `Unique definition ${keyIndex}`,
        examples: [],
        sourceSlugs: ['source'],
      },
    ],
  };
  return { entry: payload, entryHash: hashCanonical(payload) };
}

test('family-safe split has exact counts, forces anchors to development, and has no leakage', () => {
  const entries = Array.from({ length: 1700 }, (_, index) => entry(index));
  entries[1] = entry(1, '  UNIQUE   CONCEPT 0 ');
  const publicKeys = new Set([entries[0].entry.key]);
  const families = buildConceptFamilies(entries, publicKeys);
  const shared = families.find((family) =>
    family.entryKeys.includes(entries[0].entry.key),
  );
  assert.ok(shared);
  assert.deepEqual(shared.entryKeys, [
    entries[0].entry.key,
    entries[1].entry.key,
  ]);
  const plan = buildSplitPlan(families, sha256('split-test'));
  assert.deepEqual(plan.counts, {
    development: 800,
    calibration: 300,
    validation: 300,
    audit: 100,
  });
  assert.equal(
    plan.assignments.find(
      (assignment) => assignment.familyId === shared.familyId,
    )?.split,
    'development',
  );
  const owner = new Map<string, string>();
  for (const assignment of plan.assignments) {
    for (const key of assignment.entryKeys) {
      assert.equal(owner.has(key), false, `split leakage for ${key}`);
      owner.set(key, assignment.split);
    }
  }
  assert.equal(owner.size, 1500);
});

test('corroborated single-token singular and plural titles share a family', () => {
  const singular = entry(1, 'Bootkit');
  const plural = entry(2, 'Bootkits');
  const singularPayload = {
    ...singular.entry,
    key: 'TERM:bootkit',
    slug: 'bootkit',
  };
  const pluralPayload = {
    ...plural.entry,
    key: 'TERM:bootkits',
    slug: 'bootkits',
  };
  const families = buildConceptFamilies(
    [
      { entry: singularPayload, entryHash: hashCanonical(singularPayload) },
      { entry: pluralPayload, entryHash: hashCanonical(pluralPayload) },
    ],
    new Set(),
  );
  assert.equal(families.length, 1);
  assert.deepEqual(families[0].entryKeys, ['TERM:bootkit', 'TERM:bootkits']);
});

test('a reviewed control outside the initial sample is pulled into development before freezing splits', () => {
  const entries = Array.from({ length: 1800 }, (_, index) => entry(index));
  const seed = sha256('reviewed-full-corpus-regression');
  const baselineFamilies = buildConceptFamilies(entries, new Set());
  const baseline = buildSplitPlan(baselineFamilies, seed);
  const initiallySelected = new Set(
    baseline.assignments.flatMap((assignment) => assignment.entryKeys),
  );
  const reviewedEntry = entries.find(
    (candidate) => !initiallySelected.has(candidate.entry.key),
  );
  assert.ok(
    reviewedEntry,
    'fixture must contain an entry outside the initial 1,500',
  );

  const reviewedFamilies = buildConceptFamilies(
    entries,
    new Set([reviewedEntry.entry.key]),
  );
  const frozen = buildSplitPlan(reviewedFamilies, seed);
  const assignment = frozen.assignments.find((candidate) =>
    candidate.entryKeys.includes(reviewedEntry.entry.key),
  );
  assert.equal(assignment?.forcedDevelopment, true);
  assert.equal(assignment?.split, 'development');
  assert.deepEqual(frozen.counts, {
    development: 800,
    calibration: 300,
    validation: 300,
    audit: 100,
  });
});

test('honest control builder reports shortfall and does not fabricate labels', () => {
  const byReference = new Map<string, HashedClassificationEntry>();
  let index = 1;
  for (const tag of FROZEN_RUBRIC.tags) {
    for (const anchor of tag.anchors) {
      if (byReference.has(anchor.entryReference)) continue;
      const separator = anchor.entryReference.indexOf(':');
      const entryType =
        separator < 0 ? 'TERM' : anchor.entryReference.slice(0, separator);
      const slug =
        separator < 0
          ? anchor.entryReference
          : anchor.entryReference.slice(separator + 1);
      const value = entry(index++);
      const payload = {
        ...value.entry,
        key: `${entryType}:${slug}`,
        entryType: entryType as 'TERM' | 'ACRONYM',
        slug,
      };
      byReference.set(anchor.entryReference, {
        entry: payload,
        entryHash: hashCanonical(payload),
      });
    }
  }
  const suite = buildControls(
    FROZEN_RUBRIC,
    [...byReference.values()],
    sha256('control-test'),
  );
  assert.equal(validateControls(suite), suite);
  assert.equal(suite.actualCount, 110);
  assert.equal(suite.protocolReady, false);
  assert.equal(
    suite.perTag.reduce(
      (sum, report) =>
        sum + report.positiveShortfall + report.negativeShortfall,
      0,
    ),
    550,
  );
  assert.ok(
    suite.controls.every(
      (control) => control.evidenceKind === 'public-rubric-anchor',
    ),
  );
});
