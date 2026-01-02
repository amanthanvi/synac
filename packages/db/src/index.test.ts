import { describe, expect, it } from 'vitest';

import { dbOk } from './index.js';

describe('db smoke', () => {
  it('exports dbOk', () => {
    expect(dbOk).toBe(true);
  });
});
