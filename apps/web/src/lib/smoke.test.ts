import { describe, expect, it } from 'vitest';

import { smokeOk } from './smoke';

describe('web smoke', () => {
  it('exports smokeOk', () => {
    expect(smokeOk).toBe(true);
  });
});
