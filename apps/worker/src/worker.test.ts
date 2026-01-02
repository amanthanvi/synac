import { describe, expect, it } from 'vitest';

import { workerOk } from './worker.js';

describe('worker smoke', () => {
  it('exports workerOk', () => {
    expect(workerOk).toBe(true);
  });
});
