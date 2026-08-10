import { describe, expect, it } from 'vitest';

import { stableJsonHash } from './tagging.js';

describe('stableJsonHash', () => {
  it('canonicalizes object keys recursively while preserving array order', () => {
    const first = {
      z: [{ beta: 2, alpha: 1 }],
      nested: { outerZ: { y: 2, x: 1 }, outerA: true },
      omitted: undefined,
    };
    const reordered = {
      nested: { outerA: true, outerZ: { x: 1, y: 2 } },
      z: [{ alpha: 1, beta: 2 }],
    };
    expect(stableJsonHash(first)).toBe(stableJsonHash(reordered));
    expect(stableJsonHash({ values: [1, 2] })).not.toBe(
      stableJsonHash({ values: [2, 1] }),
    );
  });
});
