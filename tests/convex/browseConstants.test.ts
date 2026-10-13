import { describe, expect, test } from 'vitest';

import { BROWSE_PAGE_MAX as WEB_BROWSE_PAGE_MAX } from '../../apps/web/src/lib/publicBrowse';
import { BROWSE_PAGE_MAX as CONVEX_BROWSE_PAGE_MAX } from '../../convex/publicBrowse';

describe('browse page cap constants', () => {
  test('the Convex clamp and the web page cap are the same value', () => {
    expect(WEB_BROWSE_PAGE_MAX).toBe(CONVEX_BROWSE_PAGE_MAX);
  });
});
