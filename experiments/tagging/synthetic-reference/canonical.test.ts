import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, hashCanonical, isSha256 } from './canonical.ts';
import { buildInjectionPackets } from './injections.ts';
import { FROZEN_RUBRIC } from './rubric.ts';
import { validateInjectionSuite, validateRubric } from './validators.ts';

test('canonical hashes ignore object insertion order', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 3 } }),
    canonicalJson({ a: { x: 3, y: 2 }, z: 1 }),
  );
  assert.equal(hashCanonical({ z: 1, a: 2 }), hashCanonical({ a: 2, z: 1 }));
  assert.equal(isSha256(hashCanonical(FROZEN_RUBRIC)), true);
});

test('frozen rubric and 44 injection packets satisfy strict schemas', () => {
  assert.equal(validateRubric(FROZEN_RUBRIC), FROZEN_RUBRIC);
  const suite = buildInjectionPackets(FROZEN_RUBRIC);
  assert.equal(validateInjectionSuite(suite), suite);
  assert.equal(suite.packets.length, 44);
  assert.deepEqual(
    [...new Set(suite.packets.map((packet) => packet.tagId))],
    FROZEN_RUBRIC.tags.map((tag) => tag.id),
  );
});
