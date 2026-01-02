import { describe, expect, it } from 'vitest';

import { sharedOk } from './index.js';

describe('shared smoke', () => {
  it('exports sharedOk', () => {
    expect(sharedOk).toBe(true);
  });
});
